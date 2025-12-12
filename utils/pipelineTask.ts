/**
 * Pipeline Task Orchestrator
 *
 * Supports ordered dependencies, optional/background steps, progress events,
 * and ensures each step runs at most once. Background tasks are started
 * after their dependencies but never block the main pipeline.
 */
export type PipelineStep = {
    name: string;
    run: () => Promise<unknown>;
    dependsOn?: string[];
    optional?: boolean;
    background?: boolean;
};

export type PipelineListeners = {
    onStart?: (stepName: string) => void;
    onComplete?: (stepName: string) => void;
    onError?: (stepName: string, error: unknown) => void;
    onBackground?: (stepName: string) => void;
    onProgress?: (state: {
        completed: number;
        total: number;
        lastFinished: string;
    }) => void;
};

type StepStatus = "pending" | "running" | "completed" | "failed";

type StepOutcome =
    | { status: "success"; optional: boolean; background: boolean; result: unknown }
    | { status: "optional-failed"; optional: true; background: boolean; error: unknown }
    | { status: "background"; optional: boolean; background: true };

const formatError = (error: unknown): string => {
    if (error instanceof Error) {
        return error.message;
    }
    if (typeof error === "string") {
        return error;
    }
    try {
        return JSON.stringify(error);
    } catch {
        return "Unknown error";
    }
};

const validateUniqueNames = (steps: PipelineStep[]) => {
    const names = new Set<string>();
    steps.forEach(step => {
        if (names.has(step.name)) {
            throw new Error(`Duplicate step name "${step.name}" found. Step names must be unique.`);
        }
        names.add(step.name);
    });
};

const validateDependenciesExist = (stepMap: Map<string, PipelineStep>) => {
    stepMap.forEach(step => {
        (step.dependsOn ?? []).forEach(dep => {
            if (!stepMap.has(dep)) {
                throw new Error(
                    `Step "${step.name}" depends on missing step "${dep}". ` +
                    "Check dependsOn declarations."
                );
            }
        });
    });
};

const validateNoCycles = (stepMap: Map<string, PipelineStep>) => {
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const walk = (name: string) => {
        if (visited.has(name)) {
            return;
        }
        if (visiting.has(name)) {
            throw new Error(`Cyclic dependency detected involving "${name}".`);
        }
        visiting.add(name);
        const step = stepMap.get(name);
        (step?.dependsOn ?? []).forEach(walk);
        visiting.delete(name);
        visited.add(name);
    };

    stepMap.forEach((_step, name) => walk(name));
};

const validateBackgroundDependencies = (stepMap: Map<string, PipelineStep>) => {
    stepMap.forEach(step => {
        if (step.background) {
            return;
        }
        (step.dependsOn ?? []).forEach(dep => {
            const depStep = stepMap.get(dep);
            if (depStep?.background) {
                throw new Error(
                    `Step "${step.name}" cannot depend on background step "${dep}" because ` +
                    "background steps are non-blocking. Make the dependency non-background or " +
                    "remove it from dependsOn."
                );
            }
        });
    });
};

/**
 * Execute a set of ordered tasks with dependency handling, optional/background support,
 * and listener callbacks. Returns a result map for non-background tasks.
 */
export const pipelineTask = async (
    steps: PipelineStep[],
    listeners: PipelineListeners = {}
): Promise<Record<string, unknown>> => {
    validateUniqueNames(steps);

    const stepMap = new Map<string, PipelineStep>();
    steps.forEach(step => stepMap.set(step.name, step));

    validateDependenciesExist(stepMap);
    validateNoCycles(stepMap);
    validateBackgroundDependencies(stepMap);

    const totalNonBackground = steps.filter(step => !step.background).length;
    const results: Record<string, unknown> = {};
    const state = new Map<string, StepStatus>();
    const executionCache = new Map<string, Promise<StepOutcome>>();
    const backgroundTasks: Promise<void>[] = [];
    let completedCount = 0;

    const runStep = (stepName: string): Promise<StepOutcome> => {
        const cached = executionCache.get(stepName);
        if (cached) {
            return cached;
        }

        const step = stepMap.get(stepName);
        if (!step) {
            throw new Error(`Step "${stepName}" is not registered.`);
        }

        const execution = (async (): Promise<StepOutcome> => {
            const currentState = state.get(stepName);
            if (currentState === "running") {
                throw new Error(`Cyclic dependency detected while executing "${stepName}".`);
            }
            if (currentState === "completed") {
                // Already finished (likely reached via another dependency branch).
                return { status: "success", optional: !!step.optional, background: !!step.background, result: results[stepName] };
            }

            state.set(stepName, "running");

            for (const depName of step.dependsOn ?? []) {
                try {
                    await runStep(depName);
                } catch (err) {
                    const blockedError = new Error(
                        `Dependency "${depName}" failed before "${stepName}" could run. ${formatError(err)}`
                    );
                    state.set(stepName, "failed");
                    listeners.onError?.(stepName, blockedError);
                    throw blockedError;
                }
            }

            listeners.onStart?.(stepName);

            if (step.background) {
                const bgWork = (async () => {
                    try {
                        await step.run();
                        state.set(stepName, "completed");
                        listeners.onComplete?.(stepName);
                    } catch (err) {
                        state.set(stepName, "failed");
                        listeners.onError?.(stepName, err);
                    } finally {
                        listeners.onBackground?.(stepName);
                    }
                })();

                // Avoid unhandled rejections from background work.
                backgroundTasks.push(bgWork.catch(() => undefined));
                return { status: "background", optional: !!step.optional, background: true };
            }

            try {
                const result = await step.run();
                state.set(stepName, "completed");
                results[stepName] = result;
                listeners.onComplete?.(stepName);
                completedCount += 1;
                listeners.onProgress?.({
                    completed: completedCount,
                    total: totalNonBackground,
                    lastFinished: stepName
                });
                return { status: "success", optional: !!step.optional, background: false, result };
            } catch (err) {
                listeners.onError?.(stepName, err);
                if (step.optional) {
                    state.set(stepName, "completed");
                    // Preserve the slot to indicate the step was attempted; store null on failure.
                    results[stepName] = null;
                    listeners.onComplete?.(stepName);
                    completedCount += 1;
                    listeners.onProgress?.({
                        completed: completedCount,
                        total: totalNonBackground,
                        lastFinished: stepName
                    });
                    return { status: "optional-failed", optional: true, background: false, error: err };
                }

                state.set(stepName, "failed");
                throw new Error(`Step "${stepName}" failed: ${formatError(err)}`);
            }
        })();

        executionCache.set(stepName, execution);
        return execution;
    };

    for (const step of steps) {
        await runStep(step.name);
    }

    // The main pipeline promise resolves here. Background tasks (if any) keep running.
    return results;
};
