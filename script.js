function dmsToRadians(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  const decimal = deg + (min / 60) + (sec / 3600);
  return decimal * (Math.PI / 180);
}

function dmsToDMSstr(dms) {
  let deg = Math.floor(dms);
  let min = Math.floor((dms - deg) * 100);
  let sec = Math.round((((dms - deg) * 100) - min) * 100);
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

  [bearing, distance, radius, dir].forEach(val => {
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

  const startNorth = 5439174.781;
  const startEast = 536593.552;

  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row = inputTable.rows[i];
    const type = row.cells[0].firstChild.value;
    const bearing = parseFloat(row.cells[1].firstChild.value);
    const distArc = parseFloat(row.cells[2].firstChild.value);
    const radius = parseFloat(row.cells[3].firstChild.value);
    const dir = row.cells[4].firstChild.value.trim().toUpperCase();
    lines.push({ type, bearing, distArc, radius, dir });
  }

  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  const report = [];
  let area = 0;
  let arcAreaCorrection = 0;

  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  const curveCenters = [];
  const curveRadii = [];
  const curveAngles = [];

  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    const next = {};
    let segType = '';
    let front = 'No';

    if (line.type === 'Straight') {
      segType = 'Line';
      const az = line.bearing;
      const length = line.distArc;
      const angleRad = dmsToRadians(az);
      const dE = length * Math.sin(angleRad);
      const dN = length * Math.cos(angleRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += length;

      report.push(
        `${(idx + 1).toString().padStart(5)}    ${segType.padEnd(7)}  ${dmsToDMSstr(az).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else if (line.type === 'Curve') {
      segType = 'Curve';
      // Interpret bearing as BC-to-Centre (Az_bc_c in degrees D.MMSS)
      const Az_bc_c = line.bearing;
      const arcLen = line.distArc;      // arc length in metres
      const R = line.radius;            // radius in metres
      const dir = line.dir;             // 'R' or 'L'

      // Central angle Δ in radians and degrees
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * 180 / Math.PI;

      // Chord length c
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Chord bearing at BC (from BC to EC)
      let chordBrg;
      if (dir === 'R') {
        // for a right curve: chordBrg = Az_bc_c - 90° + (Δ/2)
        chordBrg = Az_bc_c - 90 + (deltaDeg / 2);
      } else {
        // for a left curve: chordBrg = Az_bc_c + 90° - (Δ/2)
        chordBrg = Az_bc_c + 90 - (deltaDeg / 2);
      }
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      // Compute EC coordinates by advancing from BC along the chord
      const chordBrgRad = dmsToRadians(chordBrg);
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);
      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Area correction for curved segment (positive for R, negative for L)
      const sign = (dir === 'R') ? 1 : -1;
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute curve center for drawing
      const midE = (last.east + next.east) / 2;
      const midN = (last.north + next.north) / 2;
      // Perpendicular azimuth from BC-to-centre
      const perpAz = dmsToRadians(Az_bc_c) + (sign * Math.PI / 2);
      const h = R * Math.cos(deltaRad / 2);
      const centerE = midE + h * Math.sin(perpAz);
      const centerN = midN + h * Math.cos(perpAz);

      // Starting and ending angles (canvas uses radians, measured from x-axis)
      const startAngle = Math.atan2(last.east - centerE, last.north - centerN);
      const endAngle   = Math.atan2(next.east - centerE, next.north - centerN);
      const anticlockwise = (sign === -1);

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise });

      // Compute RAD_TO_EC: bearing from Centre to EC
      let radToEc = Az_bc_c - 180 + (sign * deltaDeg);
      if (radToEc < 0) radToEc += 360;
      if (radToEc >= 360) radToEc -= 360;

      // Report lines
      report.push(
        `${(idx + 1).toString().padStart(5)}    ${segType.padEnd(7)}  ${dmsToDMSstr(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
      report.push(
        `    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstr(deltaDeg)}`
      );
      report.push(
        `    BC_TO_RAD= ${dmsToDMSstr(Az_bc_c)}`
      );
      report.push(
        `    RAD_TO_EC= ${dmsToDMSstr(radToEc)}`
      );
      report.push(
        `    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`
      );
    }
  });

  // Shoelace formula for area (straight segments only)
  for (let i = 0; i < coords.length - 1; i++) {
    area += (coords[i].east * coords[i + 1].north) - (coords[i + 1].east * coords[i].north);
  }
  area = Math.abs(area / 2);
  const totalArea = area + arcAreaCorrection;

  // Misclosure calculations
  const end = coords[coords.length - 1];
  const closureE = startEast - end.east;
  const closureN = startNorth - end.north;
  const misclose = Math.sqrt(closureE * closureE + closureN * closureN);
  const miscloseAz = bearingFromDelta(closureE, closureN);
  const eoc = misclose > 0 ? totalTraverseDistance / misclose : 0;

  report.push('');
  report.push(`Ending location (North, East) = ( ${end.north.toFixed(3)}, ${end.east.toFixed(3)} )\n`);
  report.push(`Total Distance          : ${totalTraverseDistance.toFixed(3)}`);
  report.push(`Total Traverse Stations : ${lines.length + 1}`);
  report.push(`Misclosure Direction    : ${dmsToDMSstr(miscloseAz)} (from ending location to starting location)`);
  report.push(`Misclosure Distance     : ${misclose.toFixed(3)}`);
  report.push(`Error of Closure        : 1:${eoc.toFixed(1)}`);
  report.push(`AREA                    : ${totalArea.toFixed(3)} sq. m. (straight segment added to close traverse)`);
  report.push(`                        = ${(totalArea / 10000).toFixed(6)} Hectares\n`);
  report.push('      ***********');

  output.textContent = report.join('\n');

  // --- Draw the traverse (lines & curves) on the canvas ---
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const scale = 2;
  const offsetX = 300;
  const offsetY = 300;

  lines.forEach((line, i) => {
    const pt1 = coords[i];
    const pt2 = coords[i + 1];
    const x1 = offsetX + (pt1.east - coords[0].east) * scale;
    const y1 = offsetY - (pt1.north - coords[0].north) * scale;
    const x2 = offsetX + (pt2.east - coords[0].east) * scale;
    const y2 = offsetY - (pt2.north - coords[0].north) * scale;

    if (line.type === 'Curve') {
      const center = curveCenters[i];
      const R = curveRadii[i];
      const angle = curveAngles[i];
      if (center && angle) {
        ctx.beginPath();
        ctx.arc(
          offsetX + (center.east - coords[0].east) * scale,
          offsetY - (center.north - coords[0].north) * scale,
          Math.abs(R * scale),
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
  });

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
  addLine('Straight', '112.1529', '74.890');
  addLine('Straight', '90.2412', '35.735');
  addLine('Straight', '90.2412', '0.100');
  addLine('Straight', '179.5220', '13.129');
  // Curve inputs: 
  //   - Bearing-to-radius  (BC→Centre) = 178°37′19″ → 178.3719
  //   - Arc length = 109.569
  //   - Radius = 206.106
  //   - Direction = R
  addLine('Curve', '178.3719', '109.569', '206.106', 'R');
};
