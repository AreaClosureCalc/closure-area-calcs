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
    <td>
      <select>
        <option value="straight">Straight</option>
        <option value="curve">Curve</option>
      </select>
    </td>
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
  let sumE = 0;
  let sumN = 0;
  let totalArea = 0;

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
      sumE += dE;
      sumN += dN;
      points.push({ x: last.x + dE, y: last.y + dN });

    } else if (type === 'curve') {
      if (isNaN(bearing) || isNaN(distArc) || isNaN(radius) || (dir !== 'R' && dir !== 'L')) continue;
      const theta = distArc / radius; // in radians
      const tangent = dmmssToDecimal(bearing) * (Math.PI / 180);

      // Chord length
      const chord = 2 * radius * Math.sin(theta / 2);

      // Bearing to chord
      const chordBearing = dir === 'R'
        ? tangent - theta / 2
        : tangent + theta / 2;

      const dE = chord * Math.sin(chordBearing);
      const dN = chord * Math.cos(chordBearing);
      sumE += dE;
      sumN += dN;
      points.push({ x: last.x + dE, y: last.y + dN });
    }
  }

  for (let i = 0; i < points.length - 1; i++) {
    totalArea += (points[i].x * points[i + 1].y - points[i + 1].x * points[i].y);
  }
  totalArea = Math.abs(totalArea / 2);
  const closure = Math.sqrt(sumE ** 2 + sumN ** 2);

  document.getElementById('output').innerText = 
    `Closure error: ${closure.toFixed(3)} m\nArea: ${totalArea.toFixed(3)} m²`;
}
