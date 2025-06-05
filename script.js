// Convert a D.MMSS value (e.g. 358.3719) into true decimal degrees
function dmsToDecimal(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

// Convert a decimal‐degrees value into "D°MM'SS"" format
function dmsToDMSstr(decimalDeg) {
  let deg = Math.floor(decimalDeg);
  let rem = decimalDeg - deg;
  let totalMin = rem * 60;
  let min = Math.floor(totalMin);
  let sec = Math.round((totalMin - min) * 60);

  // Handle rounding pushing seconds or minutes to 60
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

// Given ΔE = dx and ΔN = dy, compute an azimuth (0–360°)
function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

// Append a new row to the HTML table (defaults to a "Straight" leg)
function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
  const inputTable = document.getElementById('inputTable');
  const row = inputTable.insertRow();

  // 1) "Type" dropdown cell
  const cellType = row.insertCell();
  const select = document.createElement('select');
  ['Straight', 'Curve'].forEach(t => {
    const option = document.createElement('option');
    option.value = t;
    option.text = t;
    if (t === type) option.selected = true;
    select.appendChild(option);
  });
  cellType.appendChild(select);

  // 2) Next four cells: Bearing, Distance/Arc, Radius, Direction
  [bearing, distance, radius, dir].forEach(val => {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = val;
    cell.appendChild(input);
  });

  // 3) "Delete" button cell
  const cellAction = row.insertCell();
  const button = document.createElement('button');
  button.textContent = 'Delete';
  button.onclick = () => row.remove();
  cellAction.appendChild(button);
}

// Main "Calculate" function
function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output     = document.getElementById('output');
  const canvas     = document.getElementById('canvas');
  const ctx        = canvas.getContext('2d');

  // --------------------------------------------
  // 1) Hard‐coded starting coordinate: N = 500000, E = 100000
  // --------------------------------------------
  const startNorth = 500000;
  const startEast  = 100000;

  // 2) Read table rows into "lines" array
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row         = inputTable.rows[i];
    const type        = row.cells[0].firstChild.value;             // "Straight" or "Curve"
    const bearingDMS  = parseFloat(row.cells[1].firstChild.value); // D.MMSS
    const distArc     = parseFloat(row.cells[2].firstChild.value); // length (m) or arc length (m)
    const radius      = parseFloat(row.cells[3].firstChild.value); // R (m), only if "Curve"
    const dir         = row.cells[4].firstChild.value.trim().toUpperCase(); // "R" or "L"
    lines.push({ type, bearingDMS, distArc, radius, dir });
  }

  // 3) Build up coords[] by traversing each segment in order
  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let arcAreaCorrection     = 0;

  // Prepare the text report
  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  // Arrays to hold data needed for drawing curves
  const curveCenters = [];
  const curveRadii   = [];
  const curveAngles  = [];

  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    let next = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // ----- Straight segment -----
      const azDeg    = dmsToDecimal(line.bearingDMS);
      const length   = line.distArc;
      const angleRad = azDeg * (Math.PI / 180);

      const dE = length * Math.sin(angleRad);
      const dN = length * Math.cos(angleRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += length;

      // Append to report (end coords to 3 decimal places)
      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstr(azDeg).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else {
      // ----- Curve segment (Radial‐Chord) -----
      const Az_bc_c = dmsToDecimal(line.bearingDMS);
      const arcLen  = line.distArc;
      const R       = line.radius;
      const sign    = (line.dir === 'R') ? 1 : -1;

      // Central angle Δ in radians & degrees
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180 / Math.PI);

      // Chord length c = 2·R·sin(Δ/2)
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Compute chord bearing from BC → EC:
      let chordBrg = (line.dir === 'R')
                    ? Az_bc_c - (90 - deltaDeg/2)
                    : Az_bc_c + (90 - deltaDeg/2);
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      // Advance from BC along that chord to find EC
      const chordBrgRad = chordBrg * (Math.PI / 180);
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Arc‐segment area correction
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute center of curvature
      const midE    = (last.east + next.east) / 2;
      const midN    = (last.north + next.north) / 2;
      const perpAz  = (Az_bc_c * (Math.PI / 180)) + (sign * Math.PI / 2);
      const h       = R * Math.cos(deltaRad / 2);
      const centerE = midE + h * Math.sin(perpAz);
      const centerN = midN + h * Math.cos(perpAz);

      // Compute correct startAngle/endAngle for the minor arc:
      let startAngle = Math.atan2(last.north - centerN, last.east - centerE);
      let endAngle   = Math.atan2(next.north - centerN, next.east - centerE);

      if (sign === 1) {
        // Right curve: if endAngle > startAngle, subtract 2π to get the minor (CW) path
        if (endAngle > startAngle) endAngle -= 2 * Math.PI;
      } else {
        // Left curve: if endAngle < startAngle, add 2π to get the minor (CCW) path
        if (endAngle < startAngle) endAngle += 2 * Math.PI;
      }

      // Store on array for drawing
      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise: (sign === -1) });

      // Compute RAD → EC for the report
      let radToEc = Az_bc_c - 180 + (sign * deltaDeg);
      if (radToEc < 0)   radToEc += 360;
      if (radToEc >= 360) radToEc -= 360;

      // Append to report (rounded to 3 decimals)
      report.push(
        `${(idx + 1).toString().padStart(5)}    ${'Curve'.padEnd(7)}  ${dmsToDMSstr(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );
      report.push(`    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstr(deltaDeg)}`);
      report.push(`    BC_TO_RAD= ${dmsToDMSstr(Az_bc_c)}`);
      report.push(`    RAD_TO_EC= ${dmsToDMSstr(radToEc)}`);
      report.push(`    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`);
    }
  });

  // ------------------------------------------------
  // 4) Compute “shoelace” area of the straight‐chord polygon
  // ------------------------------------------------
  let shoelace = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    shoelace += coords[i].east * coords[j].north - coords[j].east * coords[i].north;
  }
  const chordArea = Math.abs(shoelace / 2);
  const totalArea = chordArea + arcAreaCorrection;

  // ------------------------------------------------
  // 5) Compute misclosure (end back to start)
  // ------------------------------------------------
  const end      = coords[coords.length - 1];
  const closureE = startEast - end.east;
  const closureN = startNorth - end.north;
  const misclose = Math.hypot(closureE, closureN);
  const miscloseAz = bearingFromDelta(closureE, closureN);
  const eoc = misclose > 0 ? totalTraverseDistance / misclose : 0;

  // ------------------------------------------------
  // 6) Finish the text report
  // ------------------------------------------------
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

  // --------------------------------------------
  // 7) DRAW traverse on <canvas> (auto‐scaled & centered)
  // --------------------------------------------
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 7a) Compute bounding‐box of all coords
  const allEast  = coords.map(pt => pt.east);
  const allNorth = coords.map(pt => pt.north);
  const minE = Math.min(...allEast);
  const maxE = Math.max(...allEast);
  const minN = Math.min(...allNorth);
  const maxN = Math.max(...allNorth);

  const spanE        = (maxE - minE) || 1; // avoid zero span
  const spanN        = (maxN - minN) || 1;
  const marginFactor = 1.1;               // 10% extra margin

  // 7b) Compute uniform scale so everything fits
  const scaleX = canvas.width  / (spanE * marginFactor);
  const scaleY = canvas.height / (spanN * marginFactor);
  const scale  = Math.min(scaleX, scaleY);

  // 7c) Compute world‐center and canvas center
  const midE       = (minE + maxE) / 2;
  const midN       = (minN + maxN) / 2;
  const canvasMidX = canvas.width  / 2;
  const canvasMidY = canvas.height / 2;

  // 7d) Helpers to convert (east,north) → (x,y) on canvas
  const toCanvasX = e => canvasMidX + ((e - midE) * scale);
  const toCanvasY = n => canvasMidY - ((n - midN) * scale);

  // 7e) Draw each segment in order
  lines.forEach((line, i) => {
    const P1 = coords[i];
    const P2 = coords[i + 1];
    const x1 = toCanvasX(P1.east);
    const y1 = toCanvasY(P1.north);
    const x2 = toCanvasX(P2.east);
    const y2 = toCanvasY(P2.north);

    if (line.type === 'Curve') {
      // Draw the curved segment by sampling 50 points along the true arc
      const C = curveCenters[i];
      const R = curveRadii[i];
      const A = curveAngles[i];
      if (!C) return;

      ctx.beginPath();
      for (let k = 0; k <= 50; k++) {
        const t = k / 50;
        // Interpolate angle between startAngle and endAngle
        const angle = A.start + (A.end - A.start) * t;
        // Compute world‐coords of each arc sample point
        const sampleE = C.east + R * Math.cos(angle);
        const sampleN = C.north + R * Math.sin(angle);
        // Convert to canvas coords
        const cx = toCanvasX(sampleE);
        const cy = toCanvasY(sampleN);
        if (k === 0) {
          ctx.moveTo(cx, cy);
        } else {
          ctx.lineTo(cx, cy);
        }
      }
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();

    } else {
      // Draw a straight line segment
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // 7f) Draw red dots at each traverse vertex
  coords.forEach(pt => {
    const px = toCanvasX(pt.east);
    const py = toCanvasY(pt.north);
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

// window.onload can pre‐populate with example lines if you wish
window.onload = () => {
  // addLine('Straight', '359.5222', '15.830');
  // addLine('Straight', '112.1529', '74.890');
  // addLine('Straight', '90.2412', '35.735');
  // addLine('Straight', '90.2412', '0.100');
  // addLine('Straight', '179.5220', '13.129');
  // addLine('Curve',    '358.3719', '109.569', '206.106', 'R');
};
