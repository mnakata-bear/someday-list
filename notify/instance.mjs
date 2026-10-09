// 多重起動の防止。名前付きパイプ(\\.\pipe\<name>)を1つ目のプロセスが受け付け口として持つ。
// 2つ目以降はパイプにつながったら「開いて」(1行)を送って終わる。
// Windows の名前付きパイプは、持ち主のプロセスが終わると消えるので、古いロックが残ることはない。
import net from "node:net";
import { userInfo } from "node:os";

export function pipePath(name) {
  return process.platform === "win32" ? `\\\\.\\pipe\\${name}` : `/tmp/${name}.sock`;
}

export function defaultPipeName() {
  const u = (() => { try { return userInfo().username; } catch { return "user"; } })();
  return process.env.SOMEDAY_PIPE || `someday-notify-${u.replace(/[^A-Za-z0-9_-]/g, "_")}`;
}

/**
 * 1つ目なら { primary: true, close() }。受け取った1行ごとに onMessage(line) を呼ぶ。
 * すでに動いていれば { primary: false }。
 */
export function acquireInstance(name, onMessage) {
  return new Promise((resolve) => {
    const server = net.createServer((sock) => {
      let buf = "";
      sock.setEncoding("utf8");
      sock.on("data", (d) => {
        buf += d;
        let i;
        while ((i = buf.indexOf("\n")) >= 0) { const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1); if (line) onMessage(line); }
      });
      sock.on("error", () => {});
    });
    server.once("error", (e) => {
      if (e.code === "EADDRINUSE") resolve({ primary: false });
      else resolve({ primary: true, close: () => {} }); // パイプが使えない環境では、多重起動の防止だけあきらめて表示はする
    });
    server.listen(pipePath(name), () => resolve({ primary: true, close: () => new Promise((r) => server.close(() => r())) }));
  });
}

/** 1つ目のプロセスへ1行送る。届いたら true */
export function sendToPrimary(name, line, timeoutMs = 3000) {
  return new Promise((resolve) => {
    const sock = net.connect(pipePath(name));
    const t = setTimeout(() => { sock.destroy(); resolve(false); }, timeoutMs);
    sock.on("connect", () => sock.end(line + "\n", () => { clearTimeout(t); resolve(true); }));
    sock.on("error", () => { clearTimeout(t); resolve(false); });
  });
}
