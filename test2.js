fetch("http://localhost:3000/api/ai/guest-chat", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ message: "Hello", roomNumber: "101", language: "en" })
}).then(res => res.text()).then(t => console.log(t)).catch(e => console.error(e));
