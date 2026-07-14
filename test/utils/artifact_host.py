# SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
#
# SPDX-License-Identifier: Apache-2.0
#

"""
Local artifact hosting utility for organizing and serving test artifacts
"""
import os
import shutil
import logging
from utils.common_utils import safe_test_name
import threading
import socket
from pathlib import Path
from typing import Optional, Dict
import re
from http.server import HTTPServer, SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import unquote

logger = logging.getLogger(__name__)


def _primary_ip() -> str:
    """Best-effort primary LAN IP so artifact/report links work even when name
    resolution (DNS/mDNS) fails. Override with config base_url / REPORT_BASE_URL."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))  # no packets sent; just selects the egress interface
        return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"
    finally:
        s.close()


class ArtifactHandler(SimpleHTTPRequestHandler):
    """Custom HTTP handler for serving artifacts"""
    
    def __init__(self, *args, base_path: Path = None, **kwargs):
        self.base_path = base_path or Path.cwd()
        super().__init__(*args, **kwargs)
    
    def do_HEAD(self):
        """
        Handle HEAD the same way as GET (headers only).

        Video players and download managers often probe with HEAD before
        ranged GETs; the inherited SimpleHTTPRequestHandler.do_HEAD resolves
        paths from the process cwd and ignores base_path, so route it here.
        """
        self._head_only = True
        try:
            self.do_GET()
        finally:
            self._head_only = False

    def do_GET(self):
        """Handle GET requests"""
        try:
            # Decode URL path
            path = unquote(self.path)
            
            # Remove leading slash
            if path.startswith('/'):
                path = path[1:]
            
            file_path = (self.base_path / path).resolve()
            base_path_resolved = self.base_path.resolve()
            
            logger.debug(f"Serving request: {self.path} -> {file_path} (base: {base_path_resolved})")
            
            # Security: ensure path is within base_path
            try:
                file_path.relative_to(base_path_resolved)
            except ValueError:
                logger.warning(f"Path outside base: {file_path} (base: {base_path_resolved})")
                self.send_error(403, "Forbidden")
                return
            
            # Check if file exists
            if not file_path.exists():
                # Artifact zips are built on demand.
                if path.endswith('.zip') and self._serve_ondemand_zip(path):
                    return
                logger.warning(f"File not found: {file_path} (requested: {self.path}, base: {base_path_resolved})")
                # Try alternative paths for common cases
                if path.startswith('html/') and base_path_resolved.exists():
                    # Check if html directory exists in base
                    alt_path = base_path_resolved / path
                    if alt_path.exists():
                        logger.info(f"Found file at alternative path: {alt_path}")
                        file_path = alt_path
                    else:
                        self.send_error(404, "File not found")
                        return
                else:
                    self.send_error(404, "File not found")
                    return
            
            # Check if it's a directory - return 404 (directory listing disabled)
            if file_path.is_dir():
                self.send_error(404, "Directory listing not supported.")
                return
            
            # Set content type based on extension
            ext = file_path.suffix.lower()
            content_types = {
                '.png': 'image/png',
                '.jpg': 'image/jpeg',
                '.jpeg': 'image/jpeg',
                '.mp4': 'video/mp4',
                '.txt': 'text/plain; charset=utf-8',
                '.log': 'text/plain; charset=utf-8',
                '.xml': 'application/xml',
                '.html': 'text/html; charset=utf-8',
                '.json': 'application/json',
                '.zip': 'application/zip',
            }
            content_type = content_types.get(ext, 'application/octet-stream')

            # XML is rewritten in memory (BOM/declaration fixes); everything else
            # streams from disk with Content-Length and Range support so browsers
            # render immediately and videos can seek.
            if ext == '.xml':
                body = self._load_xml_body(file_path)
                self.send_response(200)
                self.send_header('Content-type', 'application/xml; charset=utf-8')
                self.send_header('Content-Disposition', 'inline')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                if not getattr(self, '_head_only', False):
                    self.wfile.write(body)
                return

            # JSONL (cloud API logs) render as a collapsible HTML viewer, not a download.
            if ext == '.jsonl':
                body = self._render_jsonl_body(file_path)
                self.send_response(200)
                self.send_header('Content-type', 'text/html; charset=utf-8')
                self.send_header('Content-Disposition', 'inline')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                if not getattr(self, '_head_only', False):
                    self.wfile.write(body)
                return

            file_size = file_path.stat().st_size
            start, end = 0, max(file_size - 1, 0)
            range_match = re.match(r'bytes=(\d*)-(\d*)$', self.headers.get('Range') or '')
            if range_match and (range_match.group(1) or range_match.group(2)):
                if range_match.group(1):
                    start = int(range_match.group(1))
                    if range_match.group(2):
                        end = min(int(range_match.group(2)), end)
                else:  # suffix range: bytes=-N (last N bytes)
                    start = max(file_size - int(range_match.group(2)), 0)
                if start >= file_size:
                    self.send_response(416)
                    self.send_header('Content-Range', f'bytes */{file_size}')
                    self.end_headers()
                    return
                self.send_response(206)
                self.send_header('Content-Range', f'bytes {start}-{end}/{file_size}')
            else:
                self.send_response(200)

            length = end - start + 1 if file_size else 0
            self.send_header('Content-type', content_type)
            if content_type.startswith('text/') or ext in ('.xml', '.json'):
                self.send_header('Content-Disposition', 'inline')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.send_header('Accept-Ranges', 'bytes')
            self.send_header('Content-Length', str(length))
            self.end_headers()

            if getattr(self, '_head_only', False):
                return

            with open(file_path, 'rb') as f:
                f.seek(start)
                remaining = length
                while remaining > 0:
                    chunk = f.read(min(65536, remaining))
                    if not chunk:
                        break
                    self.wfile.write(chunk)
                    remaining -= len(chunk)

        except (BrokenPipeError, ConnectionResetError):
            pass  # client closed the tab / stopped the video — not an error
        except Exception as e:
            logger.error(f"Error serving file: {e}")
            self.send_error(500, str(e))

    @staticmethod
    def _load_xml_body(file_path: Path) -> bytes:
        """Load XML ensuring the declaration is first and BOM is stripped."""
        try:
            with open(file_path, 'r', encoding='utf-8-sig') as f:
                content = f.read().lstrip()
            if not content.startswith('<?xml'):
                xml_decl_match = re.search(r'<\?xml[^>]*\?>', content)
                if xml_decl_match:
                    xml_decl = xml_decl_match.group(0)
                    content = xml_decl + '\n' + content.replace(xml_decl, '', 1).lstrip()
                else:
                    content = '<?xml version="1.0" encoding="UTF-8"?>' + content
            return content.encode('utf-8')
        except Exception as e:
            logger.error(f"Error preparing XML file: {e}")
            return file_path.read_bytes()

    @staticmethod
    def _render_jsonl_body(file_path: Path) -> bytes:
        """Render a .jsonl cloud-API log as a collapsible HTML page (one <details> per call)."""
        import json as _json
        import html as _html
        from urllib.parse import urlparse as _urlparse
        rows = []
        try:
            lines = file_path.read_text(encoding='utf-8', errors='replace').splitlines()
        except Exception as e:
            return f"<pre>Could not read {_html.escape(file_path.name)}: {_html.escape(str(e))}</pre>".encode('utf-8')
        for i, line in enumerate(lines, 1):
            line = line.strip()
            if not line:
                continue
            try:
                obj = _json.loads(line)
                pretty = _json.dumps(obj, indent=2, ensure_ascii=False)
            except Exception:
                obj, pretty = None, line
            if isinstance(obj, dict):
                path = _urlparse(str(obj.get('uri', ''))).path or str(obj.get('uri', ''))
                q = obj.get('query')
                summary = f"{obj.get('ts', '')}  {obj.get('method', '')} {path}{('?' + str(q)) if q else ''}  → {obj.get('status', '')}  ({obj.get('elapsed_ms', '?')}ms)"
            else:
                summary = f"line {i}"
            rows.append(f"<details><summary>{_html.escape(summary)}</summary><pre>{_html.escape(pretty)}</pre></details>")
        style = "body{font-family:ui-monospace,Menlo,monospace;background:#1e1e1e;color:#d4d4d4;margin:0;padding:14px}h3{margin:0 0 10px}summary{cursor:pointer;padding:5px 0;color:#9cdcfe;white-space:pre-wrap}pre{background:#111;padding:10px;overflow:auto;border-radius:4px;color:#ce9178}details{border-bottom:1px solid #333}button{background:#333;color:#ddd;border:1px solid #555;border-radius:4px;padding:5px 10px;margin-right:6px;cursor:pointer}"
        controls = "<button onclick=\"document.querySelectorAll('details').forEach(d=>d.open=true)\">Expand all</button><button onclick=\"document.querySelectorAll('details').forEach(d=>d.open=false)\">Collapse all</button>"
        doc = f"<!doctype html><html><head><meta charset='utf-8'><title>{_html.escape(file_path.name)}</title><style>{style}</style></head><body><h3>{_html.escape(file_path.name)} — {len(rows)} calls</h3>{controls}<div>{''.join(rows)}</div></body></html>"
        return doc.encode('utf-8')

    @staticmethod
    def _belongs_to_test(prefix: str, filename: str) -> bool:
        """Match files named with the full test name, or with the timestamped truncated+hash form safe_test_name produces (screenshots/page_sources/device logs of long test names)."""
        base = re.sub(r'^\d{8}_\d{6}_', '', filename)
        if f"_{prefix}_" in f"_{base}":
            return True
        m = re.match(r'(.+?)_[0-9a-f]{8}_[a-z_]+\.\w+$', base)
        return bool(m and len(m.group(1)) >= 20 and prefix.startswith(m.group(1)))

    def _serve_ondemand_zip(self, url_path: str) -> bool:
        """Build and stream a zip on demand: a whole run dir, or one test's files (by safe-name prefix). Returns False if nothing to zip."""
        import io
        import zipfile
        artifacts_dir = (self.base_path / "artifacts").resolve()
        test_match = re.match(r'artifacts/([^/]+)/test/(.+)\.zip$', url_path)
        run_match = re.match(r'artifacts/([^/]+)\.zip$', url_path)
        if test_match:
            run_dir = (artifacts_dir / test_match.group(1)).resolve()
            prefix = test_match.group(2)
            download_name = f"{prefix}.zip"
            keep = lambda p: self._belongs_to_test(prefix, p.name)
        elif run_match:
            run_dir = (artifacts_dir / run_match.group(1)).resolve()
            download_name = f"{run_match.group(1)}.zip"
            keep = lambda p: True
        else:
            return False
        try:
            run_dir.relative_to(artifacts_dir)
        except ValueError:
            return False
        if not run_dir.is_dir():
            return False
        files = [p for p in run_dir.rglob('*') if p.is_file() and keep(p)]
        if not files:
            return False
        buffer = io.BytesIO()
        with zipfile.ZipFile(buffer, 'w', zipfile.ZIP_DEFLATED) as archive:
            for path in files:
                archive.write(path, path.relative_to(run_dir).as_posix())
        data = buffer.getvalue()
        self.send_response(200)
        self.send_header('Content-type', 'application/zip')
        self.send_header('Content-Disposition', f'attachment; filename="{download_name}"')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Length', str(len(data)))
        self.end_headers()
        if not getattr(self, '_head_only', False):
            self.wfile.write(data)
        return True

    def log_message(self, format, *args):
        """Suppress default logging"""
        pass
    
    def _serve_directory_listing(self, dir_path: Path, url_path: str):
        """Generate HTML directory listing"""
        try:
            files = []
            dirs = []
            
            for item in sorted(dir_path.iterdir()):
                if item.is_file():
                    files.append(item)
                elif item.is_dir():
                    dirs.append(item)
            
            # Generate HTML
            html = f"""<!DOCTYPE html>
<html>
<head>
    <title>Directory Listing: {url_path}</title>
    <style>
        body {{ font-family: Arial, sans-serif; margin: 20px; }}
        h1 {{ color: #333; }}
        ul {{ list-style: none; padding: 0; }}
        li {{ padding: 5px 0; }}
        a {{ text-decoration: none; color: #0066cc; }}
        a:hover {{ text-decoration: underline; }}
        .dir {{ font-weight: bold; }}
    </style>
</head>
<body>
    <h1>Directory: {url_path}</h1>
    <ul>
"""
            # Add parent directory link if not root
            if url_path and url_path != "/" and url_path != "artifacts":
                parent_parts = url_path.rstrip("/").split("/")
                if len(parent_parts) > 1:
                    parent_path = "/" + "/".join(parent_parts[:-1])
                else:
                    parent_path = "/artifacts"
                html += f'        <li><a href="{parent_path}">.. (Parent Directory)</a></li\n>'
            elif url_path != "artifacts":
                html += f'        <li><a href="/artifacts">.. (Back to Artifacts)</a></li\n>'
            
            # Add directories
            for d in dirs:
                dir_name = d.name
                dir_url = f"/{url_path.rstrip('/')}/{dir_name}" if url_path != "/" else f"/{dir_name}"
                html += f'        <li class="dir">📁 <a href="{dir_url}">{dir_name}/</a></li\n>'
            
            # Add files
            for f in files:
                file_name = f.name
                file_url = f"/{url_path.rstrip('/')}/{file_name}" if url_path != "/" else f"/{file_name}"
                # Determine icon based on extension
                ext = f.suffix.lower()
                icon = "📄"
                if ext in ['.png', '.jpg', '.jpeg']:
                    icon = "🖼️"
                elif ext in ['.mp4', '.avi', '.mov']:
                    icon = "🎥"
                elif ext in ['.txt', '.log']:
                    icon = "📝"
                elif ext == '.xml':
                    icon = "📋"
                html += f'        <li>{icon} <a href="{file_url}">{file_name}</a></li\n>'
            
            html += """    </ul>
</body>
</html>"""
            
            self.send_response(200)
            self.send_header('Content-type', 'text/html; charset=utf-8')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(html.encode('utf-8'))
        except Exception as e:
            logger.error(f"Error generating directory listing: {e}")
            self.send_error(500, str(e))


class ArtifactHost:
    """Manages local artifact organization and HTTP server"""
    
    def __init__(self, artifacts_dir: str = "reports/artifacts", 
                 port: int = 8000, base_url: str = None):
        # Expand ~ and resolve to absolute path for external storage
        if artifacts_dir.startswith('~'):
            artifacts_dir = str(Path.home() / artifacts_dir[1:].lstrip('/'))
        self.artifacts_dir = Path(artifacts_dir).expanduser().resolve()
        self.artifacts_dir.mkdir(parents=True, exist_ok=True)
        self.server_base_path = self.artifacts_dir.parent
        self.port = port
        self.base_url = base_url or f"http://{_primary_ip()}:{port}"
        self.server: Optional[HTTPServer] = None
        self.server_thread: Optional[threading.Thread] = None
        self.current_run_id: Optional[str] = None
        
    def _find_available_port(self, start_port: int = 8000) -> int:
        """Find an available port starting from start_port"""
        for port in range(start_port, start_port + 100):
            try:
                with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
                    s.bind(('', port))
                    return port
            except OSError:
                continue
        raise RuntimeError(f"Could not find available port starting from {start_port}")
    
    def _get_network_ip(self) -> Optional[str]:
        """Get the network IP address of this machine"""
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            s.connect(("8.8.8.8", 80))
            network_ip = s.getsockname()[0]
            s.close()
            return network_ip
        except Exception:
            return None
    
    def start_server(self) -> bool:
        """Start the HTTP server"""
        if self.server is not None:
            logger.warning("Server already running")
            return True
        
        try:
            # Find available port
            self.port = self._find_available_port(self.port)
            
            # Fallback to network IP if .local is not configured or not accessible
            if not self.base_url or 'localhost' in self.base_url or '127.0.0.1' in self.base_url:
                self.base_url = f"http://{_primary_ip()}:{self.port}"
            
            # If base_url was explicitly set to use IP, keep it; otherwise prefer .local
            # Network IP is available as fallback but .local is preferred
            
            # Create handler with base path (parent directory to serve both artifacts/ and html/)
            handler = lambda *args, **kwargs: ArtifactHandler(
                *args, base_path=self.server_base_path, **kwargs
            )
            
            # Create server - bind to 0.0.0.0 to allow network access from all interfaces
            # This allows access via localhost (127.0.0.1), network IP, and mDNS (.local)
            # Note: Ensure macOS firewall allows incoming connections on this port
            # Threading: one slow download (video) must not block other links.
            self.server = ThreadingHTTPServer(('0.0.0.0', self.port), handler)
            # Set socket options for better network accessibility
            self.server.socket.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            
            # Start server in background thread (non-daemon so it keeps running)
            def run_server():
                logger.info(f"Starting artifact server on {self.base_url}")
                logger.info(f"Serving from directory: {self.server_base_path.resolve()}")
                try:
                    self.server.serve_forever()
                except Exception as e:
                    logger.error(f"Server error: {e}")
            
            self.server_thread = threading.Thread(target=run_server, daemon=False)
            self.server_thread.start()
            
            # Give server a moment to start and verify it's running
            import time
            time.sleep(1)
            
            # Verify server is actually running
            try:
                sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                result = sock.connect_ex(('0.0.0.0', self.port))
                sock.close()
                if result == 0:
                    # Log both local and network access URLs
                    local_ip = "127.0.0.1"
                    network_ip = self._get_network_ip()
                    logger.info(f"Artifact server started successfully!")
                    logger.info(f"Primary URL (mDNS): {self.base_url}")
                    logger.info(f"Local access: http://{local_ip}:{self.port}")
                    if network_ip:
                        logger.info(f"Network IP access: http://{network_ip}:{self.port}")
                    logger.info(f"Serving from directory: {self.server_base_path.resolve()}")
                    return True
                else:
                    logger.warning(f"Server thread started but port {self.port} is not accessible")
                    return False
            except Exception as e:
                logger.warning(f"Could not verify server status: {e}")
                logger.info(f"Artifact server thread started at {self.base_url}")
                return True
            
        except Exception as e:
            logger.error(f"Failed to start server: {e}")
            return False
    
    def stop_server(self):
        """Stop the HTTP server"""
        if self.server is not None:
            logger.info("Stopping artifact server")
            self.server.shutdown()
            self.server.server_close()
            self.server = None
            self.server_thread = None
    
    def create_run_directory(self, run_id: str) -> Path:
        """Create directory structure for a test run"""
        run_dir = self.artifacts_dir / run_id
        run_dir.mkdir(parents=True, exist_ok=True)
        
        # Create subdirectories
        (run_dir / "screenshots").mkdir(exist_ok=True)
        (run_dir / "videos").mkdir(exist_ok=True)
        (run_dir / "logs").mkdir(exist_ok=True)
        (run_dir / "page_sources").mkdir(exist_ok=True)
        
        self.current_run_id = run_id
        return run_dir
    
    def organize_artifact(self, source_path: str, artifact_type: str, 
                         test_name: str = None, run_id: str = None) -> Dict[str, str]:
        """
        Organize an artifact into the proper directory structure
        
        Args:
            source_path: Path to the source artifact file
            artifact_type: Type of artifact (screenshot, video, log, page_source)
            test_name: Name of the test (optional, for naming)
            run_id: Test run ID (optional, uses current if not provided)
        
        Returns:
            Dict with 'local_path' and 'url' keys
        """
        if not os.path.exists(source_path):
            logger.warning(f"Source file does not exist: {source_path}")
            return {}
        
        run_id = run_id or self.current_run_id
        if not run_id:
            # Generate run_id from timestamp if not provided
            import time
            run_id = time.strftime("%H%M%S_%d%m%Y")
            self.create_run_directory(run_id)
        
        # Ensure run directory exists
        run_dir = self.artifacts_dir / run_id
        if not run_dir.exists():
            run_dir = self.create_run_directory(run_id)
        
        # Determine target subdirectory
        type_map = {
            'screenshot': 'screenshots',
            'video': 'videos',
            'log': 'logs',
            'adb_logs': 'logs',
            'serial_log': 'logs',
            'page_source': 'page_sources',
        }
        subdir = type_map.get(artifact_type, 'logs')
        target_dir = run_dir / subdir
        target_dir.mkdir(parents=True, exist_ok=True)
        
        source_file = Path(source_path)
        if test_name:
            safe_name = safe_test_name(test_name, max_len=80)
            ext = source_file.suffix
            target_filename = f"{safe_name}_{artifact_type}{ext}"
        else:
            original_name = source_file.name
            if artifact_type in original_name.lower():
                ext = source_file.suffix
                target_filename = f"{artifact_type}{ext}"
            else:
                target_filename = original_name
        
        target_path = target_dir / target_filename
        
        # Copy file
        try:
            shutil.copy2(source_path, target_path)
            logger.info(f"Organized artifact: {source_path} -> {target_path}")
        except Exception as e:
            logger.error(f"Failed to copy artifact: {e}")
            return {}
        
        relative_path = target_path.relative_to(self.artifacts_dir)
        url = f"{self.base_url}/artifacts/{relative_path.as_posix()}"
        
        return {
            'local_path': str(target_path),
            'url': url,
            'run_id': run_id
        }
    
    def is_server_running(self, port: int = None) -> bool:
        """Check if server is already running on the specified port"""
        check_port = port or self.port
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            result = sock.connect_ex(('0.0.0.0', check_port))
            sock.close()
            return result == 0
        except:
            return False
    
    def get_artifact_url(self, local_path: str) -> Optional[str]:
        """Get URL for an artifact given its local path"""
        try:
            # Check if server is already running (standalone mode)
            if self.is_server_running():
                logger.debug(f"Using existing server on port {self.port}")
                # Prefer the host's own name (mDNS) - only update if not already set
                if not self.base_url or 'localhost' in self.base_url or '127.0.0.1' in self.base_url:
                    self.base_url = f"http://{_primary_ip()}:{self.port}"
            elif self.server is None:
                # Server not running and not started - log warning but don't start
                logger.warning(f"Server not running on port {self.port}. Start it manually with: python scripts/start_artifact_server.py")
                return None
            
            # Expand and resolve the local path
            local_path_obj = Path(local_path).expanduser().resolve()
            artifacts_path_obj = self.artifacts_dir.resolve()
            server_base = self.server_base_path.resolve()
            
            logger.debug(f"Generating URL for: {local_path_obj}")
            logger.debug(f"Artifacts dir: {artifacts_path_obj}")
            logger.debug(f"Server base: {server_base}")
            
            # Check if path is within artifacts directory
            try:
                relative_path = local_path_obj.relative_to(artifacts_path_obj)
                # Server serves from server_base, so artifacts are at artifacts/ subdirectory
                url = f"{self.base_url}/artifacts/{relative_path.as_posix()}"
                logger.debug(f"Generated artifact URL: {url}")
                return url
            except ValueError:
                # Path is outside artifacts directory
                pass
            
            # Check if it's a report in html/ directory
            try:
                relative_path = local_path_obj.relative_to(server_base)
                url = f"{self.base_url}/{relative_path.as_posix()}"
                logger.debug(f"Generated report URL: {url} (relative to server_base: {relative_path})")
                return url
            except (ValueError, AttributeError):
                pass
            
            # Fallback: If path contains 'html' or is an HTML file, try direct html/ path
            if 'html' in str(local_path_obj) or local_path_obj.suffix == '.html':
                filename = local_path_obj.name
                url = f"{self.base_url}/html/{filename}"
                logger.info(f"Generated report URL (fallback): {url}")
                return url
            
            # Check if path is in debug/ directory (workspace root)
            # Try to organize it first, then generate URL
            try:
                workspace_root = Path.cwd()
                if local_path_obj.resolve().is_relative_to(workspace_root):
                    # This is a file in debug/ or elsewhere in workspace
                    # Try to organize it into artifacts directory
                    logger.info(f"Organizing artifact from debug directory: {local_path}")
                    # Determine artifact type from path
                    artifact_type = 'log'  # default
                    if 'recording' in str(local_path_obj) or local_path_obj.suffix == '.mp4':
                        artifact_type = 'video'
                    elif 'screenshot' in str(local_path_obj) or local_path_obj.suffix in ['.png', '.jpg', '.jpeg']:
                        artifact_type = 'screenshot'
                    elif 'adb_logs' in str(local_path_obj) or ('log' in str(local_path_obj) and local_path_obj.suffix == '.txt'):
                        artifact_type = 'log'
                    elif 'page_source' in str(local_path_obj) or local_path_obj.suffix == '.xml':
                        artifact_type = 'page_source'
                    elif 'appium' in str(local_path_obj).lower() and local_path_obj.suffix == '.log':
                        artifact_type = 'log'
                    
                    # Extract test name from path if possible (for better organization)
                    test_name = None
                    path_str = str(local_path_obj)
                    if 'test_' in path_str:
                        # Try to extract test name from path like debug/timestamp_test_name/file
                        parts = path_str.split('/')
                        for part in parts:
                            if 'test_' in part:
                                # Extract test name from part like "172938_13012026_test_successful_login_with_correct_credentials"
                                test_parts = part.split('_')
                                for i, p in enumerate(test_parts):
                                    if p == 'test' and i + 1 < len(test_parts):
                                        test_name = '_'.join(test_parts[i:])
                                        break
                                if test_name:
                                    break
                    
                    # Organize the artifact (use current run_id if available)
                    organized = self.organize_artifact(
                        str(local_path_obj), 
                        artifact_type, 
                        test_name=test_name,
                        run_id=self.current_run_id
                    )
                    if organized and organized.get('url'):
                        logger.info(f"Organized artifact and generated URL: {organized.get('url')}")
                        return organized.get('url')
            except Exception as e:
                logger.debug(f"Failed to organize artifact from debug directory: {e}")
            
            # If still not found, return None (will use file:// URL in email)
            logger.warning(f"Could not generate URL for path: {local_path_obj} (server_base: {server_base})")
            return None
        except Exception as e:
            logger.error(f"Error generating URL: {e}")
            return None
    
    def organize_all_artifacts(self, artifacts: Dict[str, str], 
                                test_name: str = None, run_id: str = None) -> Dict[str, Dict[str, str]]:
        """
        Organize multiple artifacts at once
        
        Args:
            artifacts: Dict with artifact_type -> local_path mapping
            test_name: Name of the test
            run_id: Test run ID
        
        Returns:
            Dict with artifact_type -> {local_path, url, run_id} mapping
        """
        organized = {}
        
        # Ensure run_id is set
        if run_id:
            self.current_run_id = run_id
        
        for artifact_type, local_path in artifacts.items():
            if local_path and os.path.exists(local_path):
                try:
                    result = self.organize_artifact(
                        local_path, artifact_type, test_name, run_id
                    )
                    if result and result.get('url'):
                        organized[artifact_type] = result
                        logger.info(f"Organized {artifact_type}: {result.get('url')}")
                    else:
                        logger.warning(f"Failed to organize {artifact_type}: {local_path} (result: {result})")
                except Exception as e:
                    logger.error(f"Error organizing {artifact_type} from {local_path}: {e}", exc_info=True)
            else:
                logger.warning(f"Artifact file does not exist: {local_path} (type: {artifact_type})")
        
        return organized


# Global instance
_artifact_host: Optional[ArtifactHost] = None


def get_artifact_host() -> ArtifactHost:
    """Get or create global artifact host instance, reading config if available"""
    global _artifact_host
    if _artifact_host is None:
        try:
            import yaml
            config_path = Path("config/report_config.yaml")
            if config_path.exists():
                with open(config_path, 'r') as f:
                    config = yaml.safe_load(f)
                hosting_config = config.get('local_hosting', {})
                artifacts_dir = hosting_config.get('artifacts_dir', 'reports/artifacts')
                port = hosting_config.get('http_server_port', 8000)
                base_url = hosting_config.get('base_url') or f'http://{_primary_ip()}:{port}'
                _artifact_host = ArtifactHost(artifacts_dir=artifacts_dir, port=port, base_url=base_url)
                logger.info(f"Initialized artifact host from config: {artifacts_dir}")
            else:
                _artifact_host = ArtifactHost()
                logger.warning("Config file not found, using default artifact host settings")
        except ImportError:
            _artifact_host = ArtifactHost()
            logger.warning("PyYAML not available, using default artifact host settings")
        except Exception as e:
            logger.warning(f"Failed to read config, using default artifact host: {e}")
            _artifact_host = ArtifactHost()
    return _artifact_host


def initialize_artifact_host(artifacts_dir: str = "reports/artifacts",
                             port: int = 8000, base_url: str = None,
                             auto_start: bool = True) -> ArtifactHost:
    """Initialize the global artifact host"""
    global _artifact_host
    _artifact_host = ArtifactHost(artifacts_dir, port, base_url)
    if auto_start:
        _artifact_host.start_server()
    return _artifact_host
