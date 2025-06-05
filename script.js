// Convert D.MMSS (e.g., 358.3719) into true decimal degrees (358.621944…)
function dmsToDecimal(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

// Convert a true decimal‐degrees value (e.g., 283.851388…) into "D°MM'SS"" format
function dmsToDMSstr(decimalDeg) {
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

// Given ΔE (dx) and ΔN (dy), compute an azimuth in degrees
function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

// Append a new row to the input table (either Straight or Curve)
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

// Main calculation and drawing function
function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output     = document.getElementById('output');
  const canvas     = document.getElementById('canvas');
  const ctx        = canvas.getContext('2d');

  // Updated starting coordinates (both North and East = 10000)
  const startNorth = 10000;
  const startEast  = 10000;

  // 1) Read all lines from the HTML table into an array
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row         = inputTable.rows[i];
    const type        = row.cells[0].firstChild.value;            // "Straight" or "Curve"
    const bearingDMS  = parseFloat(row.cells[1].firstChild.value); // D.MMSS
    const distArc     = parseFloat(row.cells[2].firstChild.value); // Straight length or arc length (m)
    const radius      = parseFloat(row.cells[3].firstChild.value); // Radius (m) if curve
    const dir         = row.cells[4].firstChild.value.trim().toUpperCase(); // "R" or "L"
    lines.push({ type, bearingDMS, distArc, radius, dir });
  }

  // 2) Build up coords[] by traversing each segment
  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let arcAreaCorrection     = 0;

  // Prepare the text report
  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  // Arrays for curve‐drawing parameters
  const curveCenters = []; // will hold { east, north } for each curve segment
  const curveRadii   = []; // radius for each curve
  const curveAngles  = []; // { start, end, anticlockwise } for each curve

  lines.forEach((line, idx) => {
    const last  = coords[coords.length - 1];
    let next = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // ------ Straight segment ------
      const azDeg    = dmsToDecimal(line.bearingDMS);    // convert D.MMSS → decimal degrees
      const length   = line.distArc;                     // straight length (m)
      const angleRad = (azDeg * Math.PI / 180);

      const dE = length * Math.sin(angleRad);
      const dN = length * Math.cos(angleRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += length;

      // Print the straight segment line, with End_Easting rounded to 3 decimals
      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstr(azDeg).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );

      // No curve data for a straight leg
      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else {
      // ------ Curve segment ------
      // Inputs:
      //   line.bearingDMS = BC→Centre in D.MMSS
      //   line.distArc    = arc length (m)
      //   line.radius     = radius (m)
      //   line.dir        = 'R' or 'L'
      const Az_bc_c = dmsToDecimal(line.bearingDMS);
      const arcLen  = line.distArc;
      const R       = line.radius;
      const sign    = (line.dir === 'R') ? 1 : -1;

      // Central angle Δ
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180 / Math.PI);

      // Chord length
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Compute chord bearing (BC → EC)
      //   Right curve: chordBrg = Az_bc_c − (90 − Δ/2)
      //   Left curve:  chordBrg = Az_bc_c + (90 − Δ/2)
      let chordBrg = (line.dir === 'R')
                    ? Az_bc_c - (90 - deltaDeg / 2)
                    : Az_bc_c + (90 - deltaDeg / 2);
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      // Advance from BC along that chord to get EC
      const chordBrgRad = chordBrg * (Math.PI / 180);
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Arc‐segment area correction (positive for R, negative for L)
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute circle center for drawing
      const midE    = (last.east + next.east) / 2;
      const midN    = (last.north + next.north) / 2;
      const perpAz  = (Az_bc_c * Math.PI / 180) + (sign * Math.PI / 2);
      const h       = R * Math.cos(deltaRad / 2);
      const centerE = midE + h * Math.sin(perpAz);
      const centerN = midN + h * Math.cos(perpAz);

      const startAngle    = Math.atan2(last.east - centerE, last.north - centerN);
      const endAngle      = Math.atan2(next.east - centerE, next.north - centerN);
      const anticlockwise = (sign === -1);

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise });

      // Compute RAD→EC = (Az_bc_c − 180 + sign*Δ) mod 360
      let radToEc = Az_bc_c - 180 + (sign * deltaDeg);
      if (radToEc < 0) radToEc += 360;
      if (radToEc >= 360) radToEc -= 360;

      // Print the curve line, with chord bearing, chord length, and end coords (to 3 decimals)
      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Curve'.padEnd(7)}  ${dmsToDMSstr(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );
      report.push(`    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstr(deltaDeg)}`);
      report.push(`    BC_TO_RAD= ${dmsToDMSstr(Az_bc_c)}`);
      report.push(`    RAD_TO_EC= ${dmsToDMSstr(radToEc)}`);
      report.push(`    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`);
    }
  });

  // 3) Shoelace polygon area (including wrap-around)
  let shoelace = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    shoelace += coords[i].east * coords[j].north - coords[j].east * coords[i].north;
  }
  const chordArea = Math.abs(shoelace / 2);
  const totalArea = chordArea + arcAreaCorrection;

  // 4) Misclosure calculations
  const end      = coords[coords.length - 1];
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

  // ----- Drawing on canvas (auto-scaled + centered) -----
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 5) Build bounding box from all coords
  const allEast  = coords.map(pt => pt.east);
  const allNorth = coords.map(pt => pt.north);
  const minE = Math.min(...allEast);
  const maxE = Math.max(...allEast);
  const minN = Math.min(...allNorth);
  const maxN = Math.max(...allNorth);

  const spanE        = (maxE - minE) || 1; // avoid zero span
  const spanN        = (maxN - minN) || 1;
  const marginFactor = 1.1;               // 10% margin

  // 6) Compute uniform scale so the entire shape fits
  const scaleX = canvas.width  / (spanE * marginFactor);
  const scaleY = canvas.height / (spanN * marginFactor);
  const scale  = Math.min(scaleX, scaleY);

  // 7) Find world-center of bounding box and canvas midpoint
  const midE       = (minE + maxE) / 2;
  const midN       = (minN + maxN) / 2;
  const canvasMidX = canvas.width  / 2;
  const canvasMidY = canvas.height / 2;

  // 8) Helper functions to convert (east,north) → (x,y) on the canvas
  const toCanvasX = e => canvasMidX + ((e - midE) * scale);
  const toCanvasY = n => canvasMidY - ((n - midN) * scale);

  // 9) Draw each segment (straight or curve)
  lines.forEach((line, i) => {
    const P1 = coords[i];
    const P2 = coords[i + 1];
    const x1 = toCanvasX(P1.east);
    const y1 = toCanvasY(P1.north);
    const x2 = toCanvasX(P2.east);
    const y2 = toCanvasY(P2.north);

    if (line.type === 'Curve') {
      // Draw the circular arc
      const C = curveCenters[i];
      const R = curveRadii[i];
      const A = curveAngles[i];
      if (!C) return;

      const cx = toCanvasX(C.east);
      const cy = toCanvasY(C.north);
      const r  = R * scale;

      ctx.beginPath();
      ctx.arc(cx, cy, Math.abs(r), A.start, A.end, A.anticlockwise);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();

    } else {
      // Draw a straight line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // 10) Draw red dots at each vertex
  coords.forEach(pt => {
    const px = toCanvasX(pt.east);
    const py = toCanvasY(pt.north);
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

// On page load, pre-populate the table with the five straight legs and one curve:
window.onload = () => {
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
