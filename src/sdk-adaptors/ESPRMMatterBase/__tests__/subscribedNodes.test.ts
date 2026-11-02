/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { withCurrentNode } from "../transformers/subscribedNodes";

describe("withCurrentNode", () => {
  it("replaces the old copy of a node the cloud removed and re-added", () => {
    const oldCopy = {
      id: "hybridLightNode",
      matterNodeId: "0000000000000a01",
    };
    const otherNode = { id: "otherNode", matterNodeId: undefined };
    const currentCopy = {
      id: "hybridLightNode",
      matterNodeId: "0000000000000a02",
    };

    const nodes = withCurrentNode([oldCopy, otherNode], currentCopy);

    expect(nodes).toEqual([otherNode, currentCopy]);
  });

  it("adds a node that was not subscribed yet", () => {
    const otherNode = { id: "otherNode" };
    const newNode = { id: "newLightNode" };

    const nodes = withCurrentNode([otherNode], newNode);

    expect(nodes).toEqual([otherNode, newNode]);
  });
});
