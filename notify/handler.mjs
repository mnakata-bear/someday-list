// show.ps1 から届いた1行を処理して、返事の1行を返す(返事が要らなければ null)
import { parseLine, newTaskData, placeReply, encodeB64Json } from "./proto.mjs";
import { itemView } from "./logic.mjs";

/**
 * @param {object} deps
 *   demo: true なら Firestore に書かない(見た目だけ)
 *   setDone(id, done), addTask(data) → id   Firestore 書き込み
 *   loadPos(), savePos(state)               位置・大きさの保存
 *   now(): ms
 */
export function makeHandler(deps) {
  let demoSeq = 0;
  return async function handle(line) {
    const cmd = parseLine(line);
    if (!cmd) return null;
    if (cmd.type === "done") {
      try {
        if (!deps.demo) await deps.setDone(cmd.id, cmd.done);
        return `OK ${cmd.id}`;
      } catch (e) {
        deps.log?.(`保存に失敗: ${cmd.id} ${e?.message ?? e}`);
        return `ERR ${cmd.id}`;
      }
    }
    if (cmd.type === "add") {
      const now = deps.now();
      const r = newTaskData(cmd.input, now);
      if (!r.ok) return `ADDERR ${cmd.req} ${r.error}`;
      try {
        const id = deps.demo ? `demo${++demoSeq}x${now}` : await deps.addTask(r.value);
        return `ADDED ${cmd.req} ${encodeB64Json(itemView({ id, ...r.value }, new Date(now)))}`;
      } catch (e) {
        deps.log?.(`追加に失敗: ${e?.message ?? e}`);
        return `ADDERR ${cmd.req} save`;
      }
    }
    if (cmd.type === "place") {
      if (process.env.SOMEDAY_DEBUG) deps.log?.(`[place] sig=${cmd.env.sig} center=${JSON.stringify(cmd.env.center)} win=${JSON.stringify(cmd.env.win)}`);
      return placeReply(deps.loadPos(), cmd.env);
    }
    if (cmd.type === "state") {
      try { deps.savePos(cmd.state); } catch (e) { deps.log?.(`位置を保存できません: ${e?.message ?? e}`); }
      return null;
    }
    return null;
  };
}
