function dmsToDecimal(dms) {
  // Convert D.MMSS (e.g., 358.3719) into true decimal degrees (358.621944…)
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

function dmsToRadians(dms) {
  // Take D.MMSS, convert to decimal degrees, then to radians
  return dmsToDecimal(dms) * (Math.PI / 180);
}

function dmsToDMSstr(decimalDeg) {
  // Convert a true decimal‐degrees value (e.g., 283.851388…) into "D°MM'SS"" format
  let deg = Math.floor(decimalDeg);
  let rem = decimalDeg - deg;
  let totalMin = rem * 60;
  let min = Math.floor(totalMin);
  let sec = Math.round((totalMin - min) * 60);

  // Handle rounding that might push seconds or minutes to 60
  if (sec === 60) {
    sec = 0;
    min += 1;
  }
  if (min === 60) {
    min = 0;
    deg += 1;
  }

  return `${deg}°${min.toString().padStart(2, '0')}'${sec.toString().padStart(2, '0')}"`;
}

function bearingFromDelta(dx, dy) {
  // Given ∆E (dx) and ∆N (dy), compute an azimuth in degrees
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
  // Append a new row to the input table
  const inputTable = document.getElementById('inputTable');
  const row = inputTable.insertRow();
  // "Type" dropdown: Straight or Curve
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

  // Next four cells: Bearing, Distance/Arc, Radius, Direction
  [bearing, distance, radius, dir].forEach(val => {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = val;
    cell.appendChild(input);
  });

  // "Delete" button
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

  // Hard‐coded starting coordinates
  const startNorth = 5439174.781;
  const startEast = 536593.552;

  // Read table rows into "lines" array
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row = inputTable.rows[i];
    const type = row.cells[0].firstChild.value;
    const bearingDMS = parseFloat(row.cells[1].firstChild.value); // D.MMSS
    const distArc = parseFloat(row.cells[2].firstChild.value);
    const radius = parseFloat(row.cells[3].firstChild.value);
    const dir = row.cells[4].firstChild.value.trim().toUpperCase(); // 'R' or 'L'
    lines.push({ type, bearingDMS, distArc, radius, dir });
  }

  // Build coordinate list, starting with the known point
  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let arcAreaCorrection = 0;

  // Prepare report header
  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  // Arrays to hold curve drawing data
  const curveCenters = [];
  const curveRadii = [];
  const curveAngles = [];

  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    let next = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // ---- Straight segment ----
      const azimuthDeg = dmsToDecimal(line.bearingDMS);
      const length = line.distArc;
      const angleRad = azimuthDeg * (Math.PI / 180);

      const dE = length * Math.sin(angleRad);
      const dN = length * Math.cos(angleRad);

      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += length;

      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstr(azimuthDeg).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else {
      // ---- Curve segment ----
      // Inputs:
      //   bearingDMS = BC → Centre in D.MMSS
      //   distArc = arc length (m)
      //   radius = R (m)
      //   dir = 'R' or 'L'
      const Az_bc_c = dmsToDecimal(line.bearingDMS);
      const arcLen = line.distArc;
      const R = line.radius;
      const sign = (line.dir === 'R') ? 1 : -1;

      // Central angle Δ in radians and degrees
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180 / Math.PI);

      // Chord length from BC to EC
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Compute chord bearing:
      //   If Right curve: chordBrg = Az_bc_c − (90 − Δ/2)
      //   If Left curve:  chordBrg = Az_bc_c + (90 − Δ/2)
      let chordBrg = (line.dir === 'R')
        ? Az_bc_c - (90 - deltaDeg / 2)
        : Az_bc_c + (90 - deltaDeg / 2);
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      // Advance along chord to get EC
      const chordBrgRad = chordBrg * (Math.PI / 180);
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Compute circular segment area correction
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute centre of curvature (for drawing) using midpoint + offset
      const midE = (last.east + next.east) / 2;
      const midN = (last.north + next.north) / 2;
      const perpAzRad = (Az_bc_c * (Math.PI / 180)) + (sign * Math.PI / 2);
      const h = R * Math.cos(deltaRad / 2);
      const centerE = midE + h * Math.sin(perpAzRad);
      const centerN = midN + h * Math.cos(perpAzRad);

      // Determine start/end angles for ctx.arc
      const startAngle = Math.atan2(last.east - centerE, last.north - centerN);
      const endAngle = Math.atan2(next.east - centerE, next.north - centerN);
      const anticlockwise = (sign === -1);

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise });

      // Compute RAD→EC = (Az_bc_c − 180 + sign*Δ) mod 360
      let radToEc = Az_bc_c - 180 + (sign * deltaDeg);
      if (radToEc < 0) radToEc += 360;
      if (radToEc >= 360) radToEc -= 360;

      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Curve'.padEnd(7)}  ${dmsToDMSstr(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );
      report.push(`    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstr(deltaDeg)}`);
      report.push(`    BC_TO_RAD= ${dmsToDMSstr(Az_bc_c)}`);
      report.push(`    RAD_TO_EC= ${dmsToDMSstr(radToEc)}`);
      report.push(`    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`);
    }
  });

  // Shoelace formula (including wrap‐around) for straight‐chord polygon
  let shoelace = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    shoelace += coords[i].east * coords[j].north - coords[j].east * coords[i].north;
  }
  const chordArea = Math.abs(shoelace / 2);
  const totalArea = chordArea + arcAreaCorrection;

  // Compute misclosure
  const end = coords[coords.length - 1];
  const closureE = startEast - end.east;
  const closureN = startNorth - end.north;
  const misclose = Math.hypot(closureE, closureN);
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
  report.push(`                        = ${(totalArea / 10000).toFixed(6)} Hectares`);
  report.push('');
  report.push('      ***********');

  output.textContent = report.join('\n');

  // ----- Drawing on canvas -----
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
      // Draw the arc only (no radius point dot)
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
      // Draw straight line segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.stroke();
    }
  });

  // Draw red dots at each traverse vertex (do not draw center point)
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
  // Prepopulate with the five straight legs and one curve:
  addLine('Straight', '359.5222', '15.830');
  addLine('Straight', '112.1529', '74.890');
  addLine('Straight', '90.2412', '35.735');
  addLine('Straight', '90.2412', '0.100');
  addLine('Straight', '179.5220', '13.129');

  // Correct curve inputs:
  //   BC→Centre = 358°37′19″ → 358.3719 (D.MMSS)
  //   Arc length = 109.569
  //   Radius = 206.106
  //   Direction = R
  addLine('Curve', '358.3719', '109.569', '206.106', 'R');
};
