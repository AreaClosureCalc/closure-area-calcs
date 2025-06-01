// script.js

function dmsToRadians(dms) {
  let deg = Math.floor(dms);
  let min = Math.floor((dms - deg) * 100);
  let sec = (((dms - deg) * 100) - min) * 100;
  let decimal = deg + (min / 60) + (sec / 3600);
  return decimal * (Math.PI / 180);
}

function toDMS(angle) {
  let deg = Math.floor(angle);
  let minFloat = (angle - deg) * 60;
  let min = Math.floor(minFloat);
  let sec = Math.round((minFloat - min) * 60);
  if (sec === 60) { sec = 0; min += 1; }
  if (min === 60) { min = 0; deg += 1; }
  return `${deg}°${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`;
}

function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * 180 / Math.PI;
  if (angle < 0) angle += 360;
  return angle;
}

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

function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output = document.getElementById('output');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

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
  let totalTraverseDistance = 0;
  let report = [];
  let area = 0;
  let arcAreaCorrection = 0; // segment area

  report.push('Lot Closure Report - Lot : ArterialHwy\n=================================');
  report.push('file- C:\\Users\\czari\\...\\lc_ArterialHwy.txt');
  report.push('Thursday, May 29, 2025, 2:43:59p.m.\n');
  report.push(`Starting location (North, East) = ( ${startNorth.toFixed(3)}, ${startEast.toFixed(3)} )\n`);
  report.push('(In the table below, the Length of Curves refers to the chord length.');
  report.push('                and the Bearing of Curves refers to the chord bearing.)\n');
  report.push(' Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push(' ---    -------    -------       ------   -----   ------------   -----------');

  // For canvas arc plotting:
  let curveCenters = [];
  let curveRadii = [];
  let curveAngles = [];

  for (let idx = 0; idx < lines.length; idx++) {
    let last = coords[coords.length - 1];
    let next = {};
    let az = 0, length = 0, segType = '', arcString = '', front = 'No';

    if (lines[idx].type === 'Straight') {
      segType = 'Line';
      az = lines[idx].bearing;
      length = lines[idx].distArc;
      let angleRad = dmsToRadians(az);
      let dE = length * Math.sin(angleRad);
      let dN = length * Math.cos(angleRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += length;
      report.push(
        `${(idx + 1).toString().padStart(3)}    ${segType.padEnd(7)}  ${toDMS(az).padStart(9)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
      // Push dummy for curve
      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);
    } else if (lines[idx].type === 'Curve') {
      segType = 'Curve';
      let chordBrg = lines[idx].bearing; // D.MMSS
      let arcLen = lines[idx].distArc; // arc length
      let radius = lines[idx].radius;
      let deltaRad = arcLen / radius; // delta angle, radians
      let deltaDeg = deltaRad * 180 / Math.PI;
      let chordLen = 2 * radius * Math.sin(deltaRad / 2);
      let chordBrgRad = dmsToRadians(chordBrg);

      // Advance by chord, at chord bearing
      let dE = chordLen * Math.sin(chordBrgRad);
      let dN = chordLen * Math.cos(chordBrgRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);

      // For total traverse distance: use arc length (the actual distance walked)
      totalTraverseDistance += arcLen;

      // For area: add sector minus triangle (always positive), direction (Right = positive, Left = negative)
      let sign = lines[idx].dir === "R" ? 1 : -1;
      let segArea = sign * (0.5 * radius * radius * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      arcString = `ARC= ${arcLen}, RAD= ${radius}, DELTA= ${toDMS(deltaDeg)}\nADD_ARC_AREA = ${segArea.toFixed(3)}`;
      report.push(
        `${(idx + 1).toString().padStart(3)}    ${segType.padEnd(7)}  ${toDMS(chordBrg).padStart(9)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
      report.push(arcString);

      // Store curve center for canvas
      // Chord midpoint
      let midE = (last.east + next.east) / 2;
      let midN = (last.north + next.north) / 2;
      // Chord azimuth
      let chordAz = chordBrgRad;
      // Center direction: +90deg for Right, -90deg for Left
      let perpAz = chordAz + sign * Math.PI / 2;
      // Distance from chord midpoint to center
      let h = radius * Math.cos(deltaRad / 2);
      let centerE = midE + h * Math.sin(perpAz);
      let centerN = midN + h * Math.cos(perpAz);
      curveCenters.push({east: centerE, north: centerN});
      curveRadii.push(radius);
      // Start/end angles (canvas uses atan2(y, x))
      let startAngle = Math.atan2(last.east - centerE, last.north - centerN);
      let endAngle = Math.atan2(next.east - centerE, next.north - centerN);
      curveAngles.push({start: startAngle, end: endAngle, anticlockwise: sign === -1});
    }
  }

  // Shoelace area (for chord geometry)
  for (let i = 0; i < coords.length - 1; i++) {
    area += (coords[i].east * coords[i + 1].north) - (coords[i + 1].east * coords[i].north);
  }
  area = Math.abs(area / 2);

  // Add sum of arc segment areas
  let totalArea = area + arcAreaCorrection;

  // Misclosure (end to start)
  let end = coords[coords.length - 1];
  let closureE = startEast - end.east;
  let closureN = startNorth - end.north;
  let misclose = Math.sqrt(closureE ** 2 + closureN ** 2);
  let miscloseAz = bearingFromDelta(closureE, closureN);
  let eoc = misclose > 0 ? totalTraverseDistance / misclose : 0;

  report.push('');
  report.push(`Ending location (North, East) = ( ${end.north.toFixed(3)}, ${end.east.toFixed(3)} )\n`);
  report.push(`Total Distance          : ${totalTraverseDistance.toFixed(3)}`);
  report.push(`Total Traverse Stations : ${lines.length + 1}`);
  report.push(`Misclosure Direction    : ${toDMS(miscloseAz)} (from ending location to starting location)`);
  report.push(`Misclosure Distance     : ${misclose.toFixed(3)}`);
  report.push(`Error of Closure        : 1:${eoc.toFixed(1)}`);
  report.push(`AREA                    : ${totalArea.toFixed(3)} sq. m. (straight segment added to close traverse)`);
  report.push(`                        = ${(totalArea / 10000).toFixed(6)} Hectares\n`);
  report.push('\n      ***********\n');

  output.textContent = report.join('\n');

  // --- Drawing: draw lines and arcs ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const scale = 2;
  const offsetX = 300;
  const offsetY = 300;

  for (let i = 0; i < lines.length; i++) {
    let pt1 = coords[i];
    let pt2 = coords[i + 1];
    let x1 = offsetX + (pt1.east - coords[0].east) * scale;
    let y1 = offsetY - (pt1.north - coords[0].north) * scale;
    let x2 = offsetX + (pt2.east - coords[0].east) * scale;
    let y2 = offsetY - (pt2.north - coords[0].north) * scale;

    if (lines[i].type === 'Curve') {
      // Draw actual arc between pt1 and pt2, using stored center/radius/angles
      let center = curveCenters[i];
      let radius = curveRadii[i];
      let angle = curveAngles[i];
      if (center && angle) {
        ctx.beginPath();
        ctx.arc(
          offsetX + (center.east - coords[0].east) * scale,
          offsetY - (center.north - coords[0].north) * scale,
          Math.abs(radius * scale),
          angle.start,
          angle.end,
          angle.anticlockwise
        );
        ctx.strokeStyle = 'blue';
        ctx.stroke();
      }
    } else {
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.stroke();
    }
  }

  coords.forEach(pt => {
    const x = offsetX + (pt.east - coords[0].east) * scale;
    const y = offsetY - (pt.north - coords[0].north) * scale;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

window.onload = () => {
  addLine('Straight', '359.5222', '15.830');
  addLine('Straight', '112.1549', '74.890');
  addLine('Straight', '90.2412', '35.735');
  addLine('Straight', '90.2412', '0.1');
  addLine('Straight', '179.5220', '13.129');
  addLine('Curve', '283.8511', '108.283', '206.106', 'R');
};
