const sleep = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const targets = await (await fetch("http://127.0.0.1:9223/json")).json();
  const page = targets.find(t => t.type === "page");
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  let id = 0; const pending = new Map(); const logs = [];
  ws.onmessage = e => {
    const msg = JSON.parse(e.data);
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)(msg); pending.delete(msg.id); }
    if (msg.method === "Runtime.consoleAPICalled") logs.push(msg.params.args.map(a => a.value || a.description).join(" "));
    if (msg.method === "Runtime.exceptionThrown") logs.push("EXCEPTION: " + (msg.params.exceptionDetails.exception?.description || msg.params.exceptionDetails.text));
  };
  await new Promise(r => ws.onopen = r);
  const send = (method, params = {}) => new Promise(resolve => { const mid = ++id; pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
  await send("Page.enable"); await send("Runtime.enable");
  const ev = async expression => { const res = await send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); return res.result?.result?.value; };

  for (const [email, label] of [["adminprobe@example.com","admin"],["probe2@example.com","trainee"]]) {
    logs.length = 0;
    await send("Page.navigate", { url: "http://localhost:5500/login.html" });
    await sleep(2500);
    await ev(`(() => { document.getElementById("loginEmail").value=${JSON.stringify(email)}; document.getElementById("loginPassword").value="Password123"; document.getElementById("loginForm").requestSubmit(); return "submitted"; })()`);
    await sleep(4000);
    console.log(label, "->", await ev(`location.pathname + location.search`));
    console.log(label, "toast:", await ev(`(() => { const t=document.querySelector(".edtsp-toast"); return t ? t.textContent : ""; })()`));
    console.log(label, "error:", await ev(`(() => { const e=document.getElementById("loginError"); return e && !e.hidden ? e.textContent : ""; })()`));
    console.log(label, "logs:", JSON.stringify(logs.slice(0,5)));
  }
  ws.close();
})().catch(e => { console.error(e); process.exit(1); });
