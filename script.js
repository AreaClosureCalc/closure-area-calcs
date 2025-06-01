<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Closure & Area Calculator</title>
  <link rel="stylesheet" href="style.css">
  <style>
    body {
      font-family: Calibri, sans-serif;
      background: #f9f9f9;
      padding: 20px;
    }
    table {
      border-collapse: collapse;
      width: 100%;
      margin-bottom: 10px;
    }
    th, td {
      border: 1px solid #999;
      padding: 4px;
      text-align: center;
    }
    th {
      background-color: #eee;
    }
    input {
      width: 100%;
    }
    button {
      margin-top: 10px;
      padding: 5px 10px;
    }
    canvas {
      border: 1px solid #999;
      margin-top: 10px;
      background: #fff;
    }
  </style>
</head>
<body>
  <h1>Closure & Area Calculator</h1>
  <p>Enter your lines below:</p>
  <table id="inputTable">
    <tr>
      <th>Type</th>
      <th>Bearing (D.MMSS)</th>
      <th>Distance / Arc Len (m)</th>
      <th>Radius (m)</th>
      <th>Dir (R/L)</th>
      <th>Action</th>
    </tr>
  </table>
  <button onclick="addLine()">Add Line</button>
  <button onclick="calculate()">Calculate</button>
  <pre id="output"></pre>
  <canvas id="canvas" width="600" height="600"></canvas>
  <script>
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const inputTable = document.getElementById('inputTable');
    const output = document.getElementById('output');

    function dmsToRadians(dms) {
      let deg = Math.floor(dms);
      let min = Math.floor((dms - deg) * 100);
      let sec = (((dms - deg) * 100) - min) * 100;
      let decimal = deg + (min / 60) + (sec / 3600);
      return decimal * (Math.PI / 180);
    }

    function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
      const row = inputTable.insertRow();
      const types = ['Straight', 'Curve'];
      const cellType = row.insertCell();
      const select = document.createElement('select');
      types.forEach(t => {
        const option = document.createElement('option');
        option.value = t;
        option.text = t;
        if (t === type) option.selected = true;
        select.appendChild(option);
      });
      cellType.appendChild(select);

      [bearing, distance, radius, dir].forEach((val, i) => {
        const cell = row.insertCell();
        const input = document.createElement('input');
        input.type = 'text';
        input.value = val;
        cell.appendChild(input);
      });

      const cellAction = row.insertCell();
      const button = document.createElement('button');
      button.textContent = 'Delete';
      button.onclick = () => row.remove();
      cellAction.appendChild(button);
    }

    function calculate() {
      let lines = [];
      for (let i = 1; i < inputTable.rows.length; i++) {
        const row = inputTable.rows[i];
        const type = row.cells[0].firstChild.value;
        const bearing = parseFloat(row.cells[1].firstChild.value);
        const distArc = parseFloat(row.cells[2].firstChild.value);
        const radius = parseFloat(row.cells[3].firstChild.value);
        const dir = row.cells[4].firstChild.value.trim().toUpperCase();

        lines.push({ type, bearing, distArc, radius, dir });
      }

      let coords = [{ x: 0, y: 0 }];

      lines.forEach(line => {
        const last = coords[coords.length - 1];
        if (line.type === 'Straight') {
          const angle = dmsToRadians(line.bearing);
          const dx = line.distArc * Math.sin(angle);
          const dy = line.distArc * Math.cos(angle);
          coords.push({ x: last.x + dx, y: last.y + dy });
        } else if (line.type === 'Curve' && line.radius && line.distArc && line.bearing) {
          const delta = (line.distArc / line.radius) * (180 / Math.PI); // in degrees
          const chord = 2 * line.radius * Math.sin((delta * Math.PI / 180) / 2);
          const chordBrg = dmsToRadians(line.bearing);
          const dx = chord * Math.sin(chordBrg);
          const dy = chord * Math.cos(chordBrg);
          coords.push({ x: last.x + dx, y: last.y + dy });
        }
      });

      let area = 0;
      let closureX = 0, closureY = 0;
      for (let i = 0; i < coords.length - 1; i++) {
        const x0 = coords[i].x, y0 = coords[i].y;
        const x1 = coords[i + 1].x, y1 = coords[i + 1].y;
        area += (x0 * y1 - x1 * y0);
        closureX += x1 - x0;
        closureY += y1 - y0;
      }

      area = Math.abs(area / 2);
      const closure = Math.sqrt(closureX ** 2 + closureY ** 2);
      output.textContent = `Closure error: ${closure.toFixed(3)} m\nArea: ${area.toFixed(3)} m²`;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.beginPath();
      coords.forEach((pt, i) => {
        const scale = 2;
        const offsetX = 300;
        const offsetY = 300;
        const x = offsetX + pt.x * scale;
        const y = offsetY - pt.y * scale;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.strokeStyle = 'blue';
      ctx.stroke();

      coords.forEach(pt => {
        const scale = 2;
        const offsetX = 300;
        const offsetY = 300;
        const x = offsetX + pt.x * scale;
        const y = offsetY - pt.y * scale;
        ctx.beginPath();
        ctx.arc(x, y, 2, 0, 2 * Math.PI);
        ctx.fillStyle = 'red';
        ctx.fill();
      });
    }

    // Sample input
    addLine('Straight', '359.5222', '15.830');
    addLine('Straight', '112.1549', '74.890');
    addLine('Straight', '90.2412', '35.735');
    addLine('Straight', '90.2412', '0.1');
    addLine('Straight', '179.5220', '13.129');
    addLine('Curve', '178.3719', '109.569', '206.106', 'R');
  </script>
</body>
</html>
