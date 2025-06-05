function dmsToRadians(dms) {
  // Interpret input in D.MMSS format (e.g., 358.3719 → 358°37′19″)
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  const decimalDegrees = deg + (min / 60) + (sec / 3600);
  return decimalDegrees * (Math.PI / 180);
}

function dmsToDMSstr(decimalDeg) {
  // Convert a true decimal‐degrees value (e.g., 283.851586…) into D°M′S″
  let deg = Math.floor(decimalDeg);
  let rem = decimalDeg - deg;
  let totalMin = rem * 60;
  let min = Math.floor(totalMin);
  let sec = Math.round((totalMin - min) * 60);

  // Handle any rounding that pushes seconds or minutes to 60
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
  // Standard azimuth from a ΔE, ΔN
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

  // Gather user inputs
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row = inputTable.rows[i];
    const type = row.cells[0].firstChild.value;
    const bearing = parseFloat(row.cells[1].firstChild.value); // in D.MMSS
    const distArc = parseFloat(row.cells[2].firstChild.value); // straight length or arc length
    const radius = parseFloat(row.cells[3].firstChild.value);
    const dir = row.cells[4].firstChild.value.trim().toUpperCase();
    lines.push({ type, bearing, distArc, radius, dir });
  }

  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let area = 0;
  let arcAreaCorrection = 0;

  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  const curveCenters = [];
  const curveRadii = [];
  const curveAngles = [];

  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    const next = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // ------ Straight segment ------
      const az = line.bearing;     // in D.MMSS
      const length = line.distArc; // straight length, metres
      const angleRad = dmsToRadians(az);
      const dE = length * Math.sin(angleRad);
      const dN = length * Math.cos(angleRad);

      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += length;

      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstr(dmsToDecimal(az)).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(9)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else if (line.type === 'Curve') {
      // ------ Curve segment ------
      // Inputs:
      //   line.bearing   = BC → Centre in D.MMSS
      //   line.distArc   = arc length (metres)
      //   line.radius    = radius (metres)
      //   line.dir       = 'R' or 'L'
      const Az_bc_c_DMS = line.bearing; 
      const arcLen = line.distArc;
      const R = line.radius;
      const dir = line.dir;

      // Convert BC→Centre from D.MMSS → true decimal degrees
      const Az_bc_c = dmsToDecimal(Az_bc_c_DMS);

      // Central angle Δ in radians & degrees
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180 / Math.PI);

      // Chord length c = 2R sin(Δ/2)
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Chord bearing from BC → EC
      // For a RIGHT curve: chordBrg = Az_bc_c − (90 − Δ/2)
      // For a LEFT curve:  chordBrg = Az_bc_c + (90 − Δ/2)
      let chordBrg;
      if (dir === 'R') {
        chordBrg = Az_bc_c - (90 - deltaDeg / 2);
      } else {
        chordBrg = Az_bc_c + (90 - deltaDeg / 2);
      }
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      // Advance from BC along that chord
      const chordBrgRad = chordBrg * Math.PI / 180;
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east = last.east + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Area correction for circular segment (R-hand positive, L-hand negative)
      const sign = (dir === 'R') ? 1 : -1;
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute centre of curvature for drawing
      const midE = (last.east + next.east) / 2;
      const midN = (last.north + next.north) / 2;
      // Perpendicular azimuth from BC→Centre (in radians)
      const perpAz = (Az_bc_c * Math.PI / 180) + (sign * Math.PI / 2);
      const h = R * Math.cos(deltaRad / 2);
      const centerE = midE + h * Math.sin(perpAz);
      const centerN = midN + h * Math.cos(perpAz);

      // Angles for canvas arc
      const startAngle = Math.atan2(last.east - centerE, last.north - centerN);
      const endAngle   = Math.atan2(next.east - centerE, next.north - centerN);
      const anticlockwise = (sign === -1);

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise });

      // RAD_TO_EC = bearing from Centre → EC = Az_bc_c ± 180 ± (Δ/2)
      //  Actually: RAD→EC = Az_bc_c − 180 + (sign * deltaDeg)
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

  // Shoelace formula for straight segments
  for (let i = 0; i < coords.length - 1; i++) {
    area += (coords[i].east * coords[i + 1].north) - (coords[i + 1].east * coords[i].north);
  }
  area = Math.abs(area / 2);
  const totalArea = area + arcAreaCorrection;

  // Misclosure
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
  report.push(`                        = ${(totalArea / 10000).toFixed(6)} Hectares\n`);
  report.push('      ***********');

  output.textContent = report.join('\n');

  // --- Draw on canvas ---
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

// Utility: convert D.MMSS → true decimal degrees
function dmsToDecimal(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

window.onload = () => {
  addLine('Straight', '359.5222', '15.830');
  addLine('Straight', '112.1529', '74.890');
  addLine('Straight', '90.2412', '35.735');
  addLine('Straight', '90.2412', '0.100');
  addLine('Straight', '179.5220', '13.129');

  // Correct curve inputs:
  //   BC→Centre = 358°37′19″ → 358.3719 (D.MMSS),
  //   Arc length = 109.569,
  //   Radius = 206.106,
  //   Direction = R
  addLine('Curve', '358.3719', '109.569', '206.106', 'R');
};
