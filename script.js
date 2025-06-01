document.getElementById('app').innerHTML = `
  <table id="inputTable" border="1" cellpadding="5">
    <tr>
      <th>Type</th>
      <th>Bearing (D.MMSS)</th>
      <th>Distance / Arc Len (m)</th>
      <th>Radius (m)</th>
      <th>Dir (R/L)</th>
      <th>Action</th>
    </tr>
  </table>
  <button onclick="addRow()">Add Line</button>
  <button onclick="calculate()">Calculate</button>
  <pre id="output"></pre>
`;

function addRow() {
  const table = document.getElementById('inputTable');
  const row = table.insertRow();
  row.innerHTML = `
    <td><select><option value="straight">Straight</option><option value="curve">Curve</option></select></td>
    <td><input type="text" placeholder="e.g. 90.3021" /></td>
    <td><input type="number" step="0.01" /></td>
    <td><input type="number" step="0.01" /></td>
    <td><input type="text" maxlength="1" /></td>
    <td><button onclick="removeRow(this)">Delete</button></td>
  `;
}

function removeRow(btn) {
  const row = btn.parentNode.parentNode;
  row.parentNode.removeChild(row);
}

function dmmssToDecimal(dmmss) {
  const deg = Math.floor(dmmss);
  const min = Math.floor((dmmss - deg) * 100);
  const sec = (((dmmss - deg) * 100) - min) * 100;
  return deg + min / 60 + sec / 3600;
}

function calculate() {
  let points = [{ x: 0, y: 0 }];
  let sumE = 0, sumN = 0, totalArea = 0;

  const table = document.getElementById('inputTable');
  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const type = row.cells[0].querySelector('select').value;
    const bearing = parseFloat(row.cells[1].querySelector('input').value);
    const distArc = parseFloat(row.cells[2].querySelector('input').value);
    const radius = parseFloat(row.cells[3].querySelector('input').value);
    const dir = row.cells[4].querySelector('input').value.toUpperCase();
    const last = points[points.length - 1];

    if (type === 'straight') {
      if (isNaN(bearing) || isNaN(distArc)) continue;
      const angle = dmmssToDecimal(bearing) * (Math.PI / 180);
      const dE = distArc * Math.sin(angle);
      const dN = distArc * Math.cos(angle);
      sumE += dE; sumN += dN;
      points.push({ x: last.x + dE, y: last.y + dN });
    } else if (type === 'curve') {
      if (isNaN(bearing) || isNaN(distArc) || isNaN(radius) || (dir !== 'R' && dir !== 'L')) continue;
      const theta = distArc / radius;
      const tangent = dmmssToDecimal(bearing) * (Math.PI / 180);
      const chord = 2 * radius * Math.sin(theta / 2);
      const chordBearing = dir === 'R' ? tangent - theta / 2 : tangent + theta / 2;
      const dE = chord * Math.sin(chordBearing);
      const dN = chord * Math.cos(chordBearing);
      sumE += dE; sumN += dN;
      points.push({ x: last.x + dE, y: last.y + dN });
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    totalArea += (points[i].x * points[i + 1].y - points[i + 1].x * points[i].y);
  }
  totalArea = Math.abs(totalArea / 2);
  const closure = Math.sqrt(sumE ** 2 + sumN ** 2);
  document.getElementById('output').innerText = `Closure error: ${closure.toFixed(3)} m\nArea: ${totalArea.toFixed(3)} m²`;

  drawPolygon(points);
}

function drawPolygon(points) {
  const canvas = document.getElementById('plotCanvas');
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const margin = 40;
  const scale = 10;
  const offsetX = canvas.width / 2;
  const offsetY = canvas.height / 2;

  ctx.beginPath();
  ctx.moveTo(points[0].x * scale + offsetX, -points[0].y * scale + offsetY);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x * scale + offsetX, -points[i].y * scale + offsetY);
  }

  ctx.strokeStyle = "blue";
  ctx.lineWidth = 2;
  ctx.closePath();
  ctx.stroke();

  // Draw points
  ctx.fillStyle = "red";
  for (let pt of points) {
    ctx.beginPath();
    ctx.arc(pt.x * scale + offsetX, -pt.y * scale + offsetY, 3, 0, 2 * Math.PI);
    ctx.fill();
  }
}
