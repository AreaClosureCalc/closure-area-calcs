// script.js

function dmsToRadians(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = ((dms - deg) * 100 - min) * 100;
  return ((deg + min / 60 + sec / 3600) * Math.PI) / 180;
}

function addLine() {
  const table = document.getElementById("inputTable");
  const row = table.insertRow();
  const types = ["Straight", "Curve"];

  ["select", "text", "text", "text", "text"].forEach((type, i) => {
    const cell = row.insertCell();
    if (i === 0) {
      const select = document.createElement("select");
      types.forEach((t) => {
        const option = document.createElement("option");
        option.value = t;
        option.text = t;
        select.appendChild(option);
      });
      cell.appendChild(select);
    } else {
      const input = document.createElement("input");
      input.type = "text";
      cell.appendChild(input);
    }
  });

  const delCell = row.insertCell();
  const delBtn = document.createElement("button");
  delBtn.textContent = "Delete";
  delBtn.onclick = () => row.remove();
  delCell.appendChild(delBtn);
}

function calculate() {
  const rows = document.querySelectorAll("#inputTable tr:not(:first-child)");
  const coords = [{ x: 0, y: 0 }];
  let x = 0, y = 0;
  let area = 0;

  for (const row of rows) {
    const type = row.cells[0].firstChild.value;
    const brg = parseFloat(row.cells[1].firstChild.value);
    const dist = parseFloat(row.cells[2].firstChild.value);
    const rad = parseFloat(row.cells[3].firstChild.value);
    const dir = row.cells[4].firstChild.value;

    if (type === "Straight") {
      const angle = dmsToRadians(brg);
      const dx = dist * Math.sin(angle);
      const dy = dist * Math.cos(angle);
      x += dx;
      y += dy;
      coords.push({ x, y });
    } else if (type === "Curve") {
      const delta = (dist * 180) / (Math.PI * rad); // degrees
      const angleRad = dmsToRadians(brg);
      const chord = 2 * rad * Math.sin((delta * Math.PI) / 360);
      const chordBrg = dir === "R" ? angleRad - (delta * Math.PI) / 360 : angleRad + (delta * Math.PI) / 360;
      const dx = chord * Math.sin(chordBrg);
      const dy = chord * Math.cos(chordBrg);
      x += dx;
      y += dy;
      coords.push({ x, y });
    }
  }

  for (let i = 0; i < coords.length - 1; i++) {
    area += coords[i].x * coords[i + 1].y - coords[i + 1].x * coords[i].y;
  }
  area = Math.abs(area / 2);

  const closureError = Math.sqrt(x * x + y * y);
  document.getElementById("output").textContent = `Closure error: ${closureError.toFixed(3)} m\nArea: ${area.toFixed(3)} m²`;
  draw(coords);
}

function draw(coords) {
  const canvas = document.getElementById("canvas");
  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = "blue";
  ctx.beginPath();

  const offsetX = canvas.width / 2;
  const offsetY = canvas.height / 2;
  const scale = 2;

  ctx.moveTo(offsetX + coords[0].x * scale, offsetY - coords[0].y * scale);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(offsetX + coords[i].x * scale, offsetY - coords[i].y * scale);
  }
  ctx.stroke();

  ctx.fillStyle = "red";
  coords.forEach((pt) => {
    ctx.beginPath();
    ctx.arc(offsetX + pt.x * scale, offsetY - pt.y * scale, 2, 0, 2 * Math.PI);
    ctx.fill();
  });
}
