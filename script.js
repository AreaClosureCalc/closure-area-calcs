// ======================
// script.js
// ======================

// Convert a D.MMSS value (for example 358.3719) into true decimal degrees
function dmsToDecimal(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

// Convert a true decimal‐degrees value into "D°MM'SS"" format
function dmsToDMSstr(decimalDeg) {
  let deg = Math.floor(decimalDeg);
  let rem = decimalDeg - deg;
  let totalMin = rem * 60;
  let min = Math.floor(totalMin);
  let sec = Math.round((totalMin - min) * 60);

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

// Given ΔE = dx and ΔN = dy, compute an azimuth in degrees from 0 to 360
function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * (180 / Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

// Add a new row to the input table (defaults to a "Straight" leg)
function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
  const inputTable = document.getElementById('inputTable');
  const row = inputTable.insertRow();

  // Type dropdown cell
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

  // Next four cells: Bearing, Distance/Arc, Radius, Direction
  [bearing, distance, radius, dir].forEach(val => {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = val;
    cell.appendChild(input);
  });

  // Delete button cell
  const cellAction = row.insertCell();
  const btn = document.createElement('button');
  btn.textContent = 'Delete';
  btn.onclick = () => row.remove();
  cellAction.appendChild(btn);
}

// Main calculation and drawing function
function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output     = document.getElementById('output');
  const canvas     = document.getElementById('canvas');
  const ctx        = canvas.getContext('2d');

  // Starting coordinates (hard‐coded)
  const startNorth = 500000;
  const startEast  = 100000;

  // Read table rows into "lines" array
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row        = inputTable.rows[i];
    const type       = row.cells[0].firstChild.value;             
    const bearingDMS = parseFloat(row.cells[1].firstChild.value);
    const distArc    = parseFloat(row.cells[2].firstChild.value);
    const radius     = parseFloat(row.cells[3].firstChild.value);
    const dir        = row.cells[4].firstChild.value.trim().toUpperCase();
    lines.push({ type, bearingDMS, distArc, radius, dir });
  }

  // Build coordinate list by traversing each line or curve
  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let arcAreaCorrection     = 0;

  // Prepare report header
  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  // Arrays to hold curve parameters for drawing
  const curveCenters = [];
  const curveRadii   = [];
  const curveAngles  = [];

  // Helper: convert D.MMSS to decimal degrees
  function dmsToDecimalLocal(dms) {
    const deg = Math.floor(dms);
    const min = Math.floor((dms - deg) * 100);
    const sec = (((dms - deg) * 100) - min) * 100;
    return deg + (min / 60) + (sec / 3600);
  }

  // Helper: convert decimal degrees to "D°MM'SS"" format
  function dmsToDMSstrLocal(decimalDeg) {
    let deg = Math.floor(decimalDeg);
    let rem = decimalDeg - deg;
    let totalMin = rem * 60;
    let min = Math.floor(totalMin);
    let sec = Math.round((totalMin - min) * 60);
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

  // Loop over each leg or curve
  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    let next  = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // Straight segment
      const azDeg  = dmsToDecimalLocal(line.bearingDMS);
      const length = line.distArc;
      const angRad = azDeg * (Math.PI / 180);

      const dE = length * Math.sin(angRad);
      const dN = length * Math.cos(angRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += length;

      report.push(
        `${(idx+1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstrLocal(azDeg).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else {
      // Curve segment using radial‐chord method
      const Az_bc_c = dmsToDecimalLocal(line.bearingDMS);
      const arcLen  = line.distArc;
      const R       = line.radius;
      const sign    = (line.dir === 'R') ? 1 : -1;

      // Central angle Δ
      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180 / Math.PI);

      // Chord length c = 2·R·sin(Δ/2)
      const chordLen = 2 * R * Math.sin(deltaRad / 2);

      // Compute chord bearing (BC→EC) in degrees
      let chordBrg = (line.dir === 'R')
                    ? Az_bc_c - (90 - deltaDeg / 2)
                    : Az_bc_c + (90 - deltaDeg / 2);
      chordBrg = ((chordBrg % 360) + 360) % 360;
      const chordBrgRad = chordBrg * (Math.PI / 180);

      // Advance from BC along chord to get EC
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Area correction for this arc segment
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute circle center by offsetting perpendicular to the chord
      const midE = (last.east + next.east) / 2;
      const midN = (last.north + next.north) / 2;

      // Unit vector along chord (BC→EC)
      const chordUnitE = dE / chordLen;
      const chordUnitN = dN / chordLen;

      // Perpendicular unit vector, depending on turn direction
      let perpUnitE, perpUnitN;
      if (line.dir === 'R') {
        perpUnitE =  chordUnitN;
        perpUnitN = -chordUnitE;
      } else {
        perpUnitE = -chordUnitN;
        perpUnitN =  chordUnitE;
      }

      // Distance from midpoint to center
      const h = R * Math.cos(deltaRad / 2);

      // Final center coordinates
      const centerE = midE + perpUnitE * h;
      const centerN = midN + perpUnitN * h;

      // Compute startAngle & endAngle around center (math angles)
      let startAngle = Math.atan2(last.north - centerN, last.east - centerE);
      let endAngle   = Math.atan2(next.north - centerN, next.east - centerE);

      if (sign === 1) {
        // Right turn: clockwise minor arc
        if (endAngle > startAngle) {
          endAngle -= 2 * Math.PI;
        }
      } else {
        // Left turn: counterclockwise minor arc
        if (endAngle < startAngle) {
          endAngle += 2 * Math.PI;
        }
      }

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle });

      // Compute RAD→EC bearing for report
      let radToEc = Az_bc_c - 180 + (sign * deltaDeg);
      radToEc = ((radToEc % 360) + 360) % 360;

      report.push(
        `${(idx+1).toString().padStart(5)}    ${'Curve'.padEnd(7)}  ${dmsToDMSstrLocal(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );
      report.push(`    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstrLocal(deltaDeg)}`);
      report.push(`    BC_TO_RAD= ${dmsToDMSstrLocal(Az_bc_c)}`);
      report.push(`    RAD_TO_EC= ${dmsToDMSstrLocal(radToEc)}`);
      report.push(`    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`);
    }
  });

  // Compute “shoelace” area for straight‐chord polygon
  let shoelace = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i + 1) % coords.length;
    shoelace += coords[i].east * coords[j].north
              - coords[j].east * coords[i].north;
  }
  const chordArea = Math.abs(shoelace / 2);
  const totalArea = chordArea + arcAreaCorrection;

  // Compute misclosure (end → start)
  const endPt    = coords[coords.length - 1];
  const closureE = startEast - endPt.east;
  const closureN = startNorth - endPt.north;
  const misclose = Math.hypot(closureE, closureN);
  const miscloseAz = bearingFromDelta(closureE, closureN);
  const eoc = misclose > 0 ? totalTraverseDistance / misclose : 0;

  // Finish text report
  report.push('');
  report.push(`Ending location (North, East) = ( ${endPt.north.toFixed(3)}, ${endPt.east.toFixed(3)} )\n`);
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

  // DRAW on the canvas (auto‐scaled & centered)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // Build a list of all world points (including sampled arc points) for scaling
  const allWorldPoints = [];
  coords.forEach(pt => {
    allWorldPoints.push({ east: pt.east, north: pt.north });
  });
  lines.forEach((line, i) => {
    if (line.type === 'Curve') {
      const C = curveCenters[i];
      const R = curveRadii[i];
      const A = curveAngles[i];
      if (!C) return;
      for (let k = 0; k <= 50; k++) {
        const t = k / 50;
        const ang = A.start + (A.end - A.start) * t;
        const sE = C.east  + R * Math.cos(ang);
        const sN = C.north + R * Math.sin(ang);
        allWorldPoints.push({ east: sE, north: sN });
      }
    }
  });

  // Compute bounding box over allWorldPoints
  const allEastVals  = allWorldPoints.map(p => p.east);
  const allNorthVals = allWorldPoints.map(p => p.north);
  const minE = Math.min(...allEastVals);
  const maxE = Math.max(...allEastVals);
  const minN = Math.min(...allNorthVals);
  const maxN = Math.max(...allNorthVals);

  const spanE = (maxE - minE) || 1;
  const spanN = (maxN - minN) || 1;
  const marginFactor = 1.1;

  const scaleX = canvas.width  / (spanE * marginFactor);
  const scaleY = canvas.height / (spanN * marginFactor);
  const scale  = Math.min(scaleX, scaleY);

  const midE   = (minE + maxE) / 2;
  const midN   = (minN + maxN) / 2;
  const cMidX  = canvas.width  / 2;
  const cMidY  = canvas.height / 2;

  function toCanvasX(e) {
    return cMidX + ((e - midE) * scale);
  }
  function toCanvasY(n) {
    return cMidY - ((n - midN) * scale);
  }

  // Draw each segment
  lines.forEach((line, i) => {
    const P1 = coords[i];
    const P2 = coords[i + 1];
    const x1 = toCanvasX(P1.east);
    const y1 = toCanvasY(P1.north);
    const x2 = toCanvasX(P2.east);
    const y2 = toCanvasY(P2.north);

    if (line.type === 'Curve') {
      // Draw the chord in blue
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 2;
      ctx.stroke();

      // Draw the arc in orange using CAD‐style ctx.arc
      const C = curveCenters[i];
      const R = curveRadii[i];
      const A = curveAngles[i];

      const cX = toCanvasX(C.east);
      const cY = toCanvasY(C.north);
      const rCanvas = R * scale;

      const worldStart = Math.atan2(P1.north - C.north, P1.east - C.east);
      const worldEnd   = Math.atan2(P2.north - C.north, P2.east - C.east);

      const startAng = -worldStart;
      const endAng   = -worldEnd;
      const anticlockwise = (line.dir === 'L');

      ctx.beginPath();
      ctx.arc(
        cX,
        cY,
        rCanvas,
        startAng,
        endAng,
        anticlockwise
      );
      ctx.strokeStyle = 'orange';
      ctx.lineWidth   = 2;
      ctx.stroke();

    } else {
      // Straight line in blue
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth   = 2;
      ctx.stroke();
    }
  });

  // Draw red points at each vertex
  coords.forEach(pt => {
    const px = toCanvasX(pt.east);
    const py = toCanvasY(pt.north);
    ctx.beginPath();
    ctx.arc(px, py, 3, 0, 2 * Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

// When the page loads, wire up the buttons
window.onload = () => {
  document.getElementById('addLineBtn').addEventListener('click', () => addLine());
  document.getElementById('calcBtn').addEventListener('click', calculate);

  // Optionally preload one example Curve row for testing:
  // addLine('Curve','358.3719','109.569','206.106','R');
};
