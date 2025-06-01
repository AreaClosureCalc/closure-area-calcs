// script.js

// Helper: Convert D.MMSS (e.g. 359.5222) to radians
function dmsToRadians(dms) {
  let deg = Math.floor(dms);
  let min = Math.floor((dms - deg) * 100);
  let sec = (((dms - deg) * 100) - min) * 100;
  let decimal = deg + (min / 60) + (sec / 3600);
  return decimal * (Math.PI / 180);
}

// Helper: Convert decimal degrees to D°MM'SS"
function toDMS(angle) {
  let deg = Math.floor(angle);
  let minFloat = (angle - deg) * 60;
  let min = Math.floor(minFloat);
  let sec = Math.round((minFloat - min) * 60);
  if (sec === 60) { sec = 0; min += 1; }
  if (min === 60) { min = 0; deg += 1; }
  return `${deg}°${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`;
}

// Helper: Calculate azimuth (in decimal degrees) from dE, dN
function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

// Add a line row to the table
function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
  const inputTable = document.getElementById('inputTable');
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

  [bearing, distance, radius, dir].forEach((val) => {
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

// Main calculation function (triggered by Calculate button)
function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output = document.getElementById('output');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // Set starting coordinates
  let startNorth = 5439174.781;
  let startEast = 536593.552;

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

  let coords = [{ north: startNorth, east: startEast }];
  let totalDistance = 0;
  let report = [];
  let area = 0;

  report.push('Lot Closure Report - Lot : ArterialHwy\n=================================');
  report.push('file- C:\\Users\\czari\\...\\lc_ArterialHwy.txt');
  report.push('Thursday, May 29, 2025, 2:43:59p.m.\n');
  report.push(`Starting location (North, East) = ( ${startNorth.toFixed(3)}, ${startEast.toFixed(3)} )\n`);
  report.push('(In the table below, the Length of Curves refers to the chord length.');
  report.push('                and the Bearing of Curves refers to the chord bearing.)\n');
  report.push(' Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push(' ---    -------    -------       ------   -----   ------------   -----------');

  lines.forEach((line, idx) => {
    let last = coords[coords.length - 1];
    let next = {};
    let az = 0, length = 0, segType = '', arcString = '', front = 'No';

    if (line.type === 'Straight') {
      segType = 'Line';
      az = line.bearing;
      length = line.distArc;
      let angleRad = dmsToRadians(line.bearing);
      let dE = length * Math.sin(angleRad);
      let dN = length * Math.cos(angleRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalDistance += length;
      report.push(
        `${(idx + 1).toString().padStart(3)}    ${segType.padEnd(7)}  ${toDMS(az).padStart(9)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
    } else if (line.type === 'Curve') {
      segType = 'Curve';
      // Chord properties
      let deltaRad = line.distArc / line.radius;
      let deltaDeg = deltaRad * 180 / Math.PI;
      let chord = 2 * line.radius * Math.sin(deltaRad / 2);
      length = chord;
      az = line.bearing;
      let chordRad = dmsToRadians(line.bearing);
      let dE = chord * Math.sin(chordRad);
      let dN = chord * Math.cos(chordRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalDistance += chord;
      arcString = `ARC= ${line.distArc}, RAD= ${line.radius}, DELTA= ${toDMS(deltaDeg)}\nADD_ARC_AREA = n/a`;
      report.push(
        `${(idx + 1).toString().padStart(3)}    ${segType.padEnd(7)}  ${toDMS(az).padStart(9)}   ${chord.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
      report.push(arcString);
    }
  });

  // Shoelace area
  for (let i = 0; i < coords.length - 1; i++) {
    area += (coords[i].east * coords[i + 1].north) - (coords[i + 1].east * coords[i].north);
  }
  area = Math.abs(area / 2);

  // Misclosure
  let end = coords[coords.length - 1];
  let closureE = startEast - end.east;
  let closureN = startNorth - end.north;
  let misclose = Math.sqrt(closureE ** 2 + closureN ** 2);
  let miscloseAz = bearingFromDelta(closureE, closureN);
  let eoc = misclose > 0 ? totalDistance / misclose : 0;

  report.push('');
  report.push(`Ending location (North, East) = ( ${end.north.toFixed(3)}, ${end.east.toFixed(3)} )\n`);
  report.push(`Total Distance          : ${totalDistance.toFixed(3)}`);
  report.push(`Total Traverse Stations : ${lines.length + 1}`);
  report.push(`Misclosure Direction    : ${toDMS(miscloseAz)} (from ending location to starting location)`);
  report.push(`Misclosure Distance     : ${misclose.toFixed(3)}`);
  report.push(`Error of Closure        : 1:${eoc.toFixed(1)}`);
  report.push(`AREA                    : ${area.toFixed(3)} sq. m. (straight segment added to close traverse)`);
  report.push(`                        = ${(area / 10000).toFixed(6)} Hectares\n`);
  report.push('\n      ***********\n');

  output.textContent = report.join('\n');

  // Draw on canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.beginPath();
  coords.forEach((pt, i) => {
    const scale = 2;
    const offsetX = 300;
    const offsetY = 300;
    const x = offsetX + (pt.east - startEast) * scale;
    const y = offsetY - (pt.north - startNorth) * scale;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = 'blue';
  ctx.stroke();

  coords.forEach(pt => {
    const scale = 2;
    const offsetX = 300;
    const offsetY = 300;
    const x = offsetX + (pt.east - startEast) * scale;
    const y = offsetY - (pt.north - startNorth) * scale;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

// Auto-populate with a sample on load
window.onload = () => {
  addLine('Straight', '359.5222', '15.830');
  addLine('Straight', '112.1549', '74.890');
  addLine('Straight', '90.2412', '35.735');
  addLine('Straight', '90.2412', '0.1');
  addLine('Straight', '179.5220', '13.129');
  addLine('Curve', '283.8511', '108.283', '206.106', 'R');
};
