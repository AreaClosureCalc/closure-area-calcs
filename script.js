document.getElementById('app').innerHTML = `
  <table id="inputTable" border="1" cellpadding="5">
    <tr>
      <th>Bearing (D.MMSS)</th>
      <th>Distance (m)</th>
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
  const bearingCell = row.insertCell(0);
  const distanceCell = row.insertCell(1);
  const actionCell = row.insertCell(2);

  bearingCell.innerHTML = '<input type="text" placeholder="e.g. 90.3021">';
  distanceCell.innerHTML = '<input type="number" step="0.01">';
  actionCell.innerHTML = '<button onclick="removeRow(this)">Delete</button>';
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
  let totalArea = 0;
  let sumE = 0;
  let sumN = 0;

  const table = document.getElementById('inputTable');
  for (let i = 1; i < table.rows.length; i++) {
    const row = table.rows[i];
    const bearing = parseFloat(row.cells[0].querySelector('input').value);
    const distance = parseFloat(row.cells[1].querySelector('input').value);

    if (isNaN(bearing) || isNaN(distance)) continue;

    const angle = dmmssToDecimal(bearing) * (Math.PI / 180);
    const dE = distance * Math.sin(angle);
    const dN = distance * Math.cos(angle);

    sumE += dE;
    sumN += dN;

    const lastPoint = points[points.length - 1];
    const newPoint = { x: lastPoint.x + dE, y: lastPoint.y + dN };
    points.push(newPoint);
  }

  // Area using shoelace
  for (let i = 0; i < points.length - 1; i++) {
    totalArea += (points[i].x * points[i + 1].y - points[i + 1].x * points[i].y);
  }
  totalArea = Math.abs(totalArea / 2);

  const closure = Math.sqrt(sumE ** 2 + sumN ** 2);

  document.getElementById('output').innerText = 
    `Closure error: ${closure.toFixed(3)} m\nArea: ${totalArea.toFixed(3)} m²`;
}
