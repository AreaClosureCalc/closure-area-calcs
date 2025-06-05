// Convert a D.MMSS value (e.g. 358.3719) into true decimal degrees
function dmsToDecimal(dms) {
  const deg = Math.floor(dms);
  const min = Math.floor((dms - deg) * 100);
  const sec = (((dms - deg) * 100) - min) * 100;
  return deg + (min / 60) + (sec / 3600);
}

// Convert a decimal-degrees value into "D°MM'SS"" format
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

  return `${deg}°${min.toString().padStart(2,'0')}'${sec.toString().padStart(2,'0')}"`;
}

// Given ΔE = dx and ΔN = dy, compute an azimuth (0–360°)
function bearingFromDelta(dx, dy) {
  let angle = Math.atan2(dx, dy) * (180/Math.PI);
  if (angle < 0) angle += 360;
  return angle;
}

// Append a new row to the HTML table
function addLine(type = 'Straight', bearing = '', distance = '', radius = '', dir = '') {
  const inputTable = document.getElementById('inputTable');
  const row = inputTable.insertRow();

  // Type dropdown
  const cellType = row.insertCell();
  const select = document.createElement('select');
  ['Straight','Curve'].forEach(t => {
    const opt = document.createElement('option');
    opt.value = t; opt.text = t;
    if (t === type) opt.selected = true;
    select.appendChild(opt);
  });
  cellType.appendChild(select);

  // Bearing, Distance/Arc, Radius, Direction cells
  [bearing, distance, radius, dir].forEach(val => {
    const cell = row.insertCell();
    const input = document.createElement('input');
    input.type = 'text';
    input.value = val;
    cell.appendChild(input);
  });

  // Delete button
  const cellAction = row.insertCell();
  const btn = document.createElement('button');
  btn.textContent = 'Delete';
  btn.onclick = () => row.remove();
  cellAction.appendChild(btn);
}

// Main calculate() function
function calculate() {
  const inputTable = document.getElementById('inputTable');
  const output = document.getElementById('output');
  const canvas = document.getElementById('canvas');
  const ctx = canvas.getContext('2d');

  // 1) Starting coordinate N=500000, E=100000
  const startNorth = 500000;
  const startEast  = 100000;

  // 2) Read table rows into lines[]
  const lines = [];
  for (let i = 1; i < inputTable.rows.length; i++) {
    const row = inputTable.rows[i];
    const type = row.cells[0].firstChild.value;
    const bearingDMS = parseFloat(row.cells[1].firstChild.value);
    const distArc = parseFloat(row.cells[2].firstChild.value);
    const radius = parseFloat(row.cells[3].firstChild.value);
    const dir = row.cells[4].firstChild.value.trim().toUpperCase();
    lines.push({ type, bearingDMS, distArc, radius, dir });
  }

  // 3) Build coords[] by traversing each segment
  const coords = [{ north: startNorth, east: startEast }];
  let totalTraverseDistance = 0;
  let arcAreaCorrection = 0;

  // Prepare text report
  const report = [];
  report.push('    Leg    Segment    Azimuth       Length   Front   End_Northing   End_Easting');
  report.push('    ---    -------    -------       ------   -----   ------------   -----------');

  // Arrays for curve‐drawing data
  const curveCenters = [], curveRadii = [], curveAngles = [];

  lines.forEach((line, idx) => {
    const last = coords[coords.length - 1];
    let next = {};
    const front = 'No';

    if (line.type === 'Straight') {
      // Straight segment
      const azDeg = dmsToDecimal(line.bearingDMS);
      const length = line.distArc;
      const angRad = azDeg * (Math.PI/180);

      const dE = length * Math.sin(angRad);
      const dN = length * Math.cos(angRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += length;

      // Append to report
      report.push(
        `${(idx+1).toString().padStart(5)}    ${'Line'.padEnd(7)}  ${dmsToDMSstr(azDeg).padStart(11)}   ${length.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );

      curveCenters.push(null);
      curveRadii.push(null);
      curveAngles.push(null);

    } else {
      // Curve segment
      const Az_bc_c = dmsToDecimal(line.bearingDMS);
      const arcLen = line.distArc;
      const R = line.radius;
      const sign = (line.dir === 'R') ? 1 : -1;

      const deltaRad = arcLen / R;
      const deltaDeg = deltaRad * (180/Math.PI);

      const chordLen = 2 * R * Math.sin(deltaRad/2);

      // Chord bearing from BC→EC
      let chordBrg = (line.dir === 'R')
        ? Az_bc_c - (90 - deltaDeg/2)
        : Az_bc_c + (90 - deltaDeg/2);
      if (chordBrg < 0) chordBrg += 360;
      if (chordBrg >= 360) chordBrg -= 360;

      const chordBrgRad = chordBrg * (Math.PI/180);

      // Advance along chord
      const dE = chordLen * Math.sin(chordBrgRad);
      const dN = chordLen * Math.cos(chordBrgRad);

      next.north = last.north + dN;
      next.east  = last.east  + dE;
      coords.push(next);
      totalTraverseDistance += arcLen;

      // Arc‐segment area correction
      const segArea = sign * (0.5 * R * R * (deltaRad - Math.sin(deltaRad)));
      arcAreaCorrection += segArea;

      // Compute center of curvature by offsetting perpendicular to chord:
      const midE = (last.east + next.east)/2;
      const midN = (last.north + next.north)/2;

      const perpDirRad = (line.dir === 'R')
        ? (chordBrgRad + Math.PI/2)
        : (chordBrgRad - Math.PI/2);

      const h = R * Math.cos(deltaRad/2);

      const centerE = midE + h * Math.cos(perpDirRad);
      const centerN = midN + h * Math.sin(perpDirRad);

      // Compute startAngle & endAngle (minor arc)
      let startAngle = Math.atan2(last.north - centerN, last.east - centerE);
      let endAngle   = Math.atan2(next.north - centerN, next.east - centerE);

      if (sign === 1) {
        // Right turn: ensure clockwise minor arc
        if (endAngle > startAngle) endAngle -= 2*Math.PI;
      } else {
        // Left turn: ensure CCW minor arc
        if (endAngle < startAngle) endAngle += 2*Math.PI;
      }

      curveCenters.push({ east: centerE, north: centerN });
      curveRadii.push(R);
      curveAngles.push({ start: startAngle, end: endAngle, anticlockwise: (sign===-1) });

      // Compute RAD→EC for report
      let radToEc = Az_bc_c - 180 + (sign*deltaDeg);
      if (radToEc < 0)   radToEc += 360;
      if (radToEc >= 360) radToEc -= 360;

      // Append to report
      report.push(
        `${(idx+1).toString().padStart(5)}    ${'Curve'.padEnd(7)}  ${dmsToDMSstr(chordBrg).padStart(11)}   ${chordLen.toFixed(3).padStart(7)}  ${front.padEnd(5)}  ${next.north.toFixed(3).padStart(13)}  ${next.east.toFixed(3).padStart(11)}`
      );
      report.push(`    ARC= ${arcLen.toFixed(3)}, RAD= ${R.toFixed(3)}, DELTA= ${dmsToDMSstr(deltaDeg)}`);
      report.push(`    BC_TO_RAD= ${dmsToDMSstr(Az_bc_c)}`);
      report.push(`    RAD_TO_EC= ${dmsToDMSstr(radToEc)}`);
      report.push(`    ADD_ARC_AREA = ${Math.abs(segArea).toFixed(3)}`);
    }
  });

  // 4) Shoelace area of straight-chord polygon
  let shoelace = 0;
  for (let i = 0; i < coords.length; i++) {
    const j = (i+1) % coords.length;
    shoelace += coords[i].east * coords[j].north - coords[j].east * coords[i].north;
  }
  const chordArea = Math.abs(shoelace/2);
  const totalArea = chordArea + arcAreaCorrection;

  // 5) Misclosure
  const end = coords[coords.length-1];
  const closureE = startEast - end.east;
  const closureN = startNorth - end.north;
  const misclose = Math.hypot(closureE, closureN);
  const miscloseAz = bearingFromDelta(closureE, closureN);
  const eoc = misclose>0 ? totalTraverseDistance/misclose : 0;

  // 6) Finish text report
  report.push('');
  report.push(`Ending location (North, East) = ( ${end.north.toFixed(3)}, ${end.east.toFixed(3)} )\n`);
  report.push(`Total Distance          : ${totalTraverseDistance.toFixed(3)}`);
  report.push(`Total Traverse Stations : ${lines.length+1}`);
  report.push(`Misclosure Direction    : ${dmsToDMSstr(miscloseAz)} (from ending location to starting location)`);
  report.push(`Misclosure Distance     : ${misclose.toFixed(3)}`);
  report.push(`Error of Closure        : 1:${eoc.toFixed(1)}`);
  report.push(`AREA                    : ${totalArea.toFixed(3)} sq. m. (straight segment added to close traverse)`);
  report.push(`                        = ${(totalArea/10000).toFixed(6)} Hectares`);
  report.push('');
  report.push('      ***********');

  output.textContent = report.join('\n');

  // 7) DRAW on <canvas> (auto-scaled & centered)
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // 7a) Compute bounding box of coords
  const allEast = coords.map(p => p.east);
  const allNorth= coords.map(p => p.north);
  const minE = Math.min(...allEast),
        maxE = Math.max(...allEast),
        minN = Math.min(...allNorth),
        maxN = Math.max(...allNorth);

  const spanE = (maxE-minE)||1;
  const spanN = (maxN-minN)||1;
  const marginFactor = 1.1;

  // 7b) Uniform scale so everything fits
  const scaleX = canvas.width/(spanE*marginFactor);
  const scaleY = canvas.height/(spanN*marginFactor);
  const scale = Math.min(scaleX, scaleY);

  // 7c) World-center and canvas center
  const midE = (minE+maxE)/2;
  const midN = (minN+maxN)/2;
  const cMidX = canvas.width/2;
  const cMidY = canvas.height/2;

  // 7d) Helpers to convert (east,north)→(x,y)
  const toCanvasX = e => cMidX + ((e-midE)*scale);
  const toCanvasY = n => cMidY - ((n-midN)*scale);

  // 7e) Draw each segment
  lines.forEach((line, i) => {
    const P1 = coords[i],
          P2 = coords[i+1];
    const x1 = toCanvasX(P1.east),
          y1 = toCanvasY(P1.north),
          x2 = toCanvasX(P2.east),
          y2 = toCanvasY(P2.north);

    if (line.type === 'Curve') {
      // Draw the curve by sampling 50 points
      const C = curveCenters[i];
      const R = curveRadii[i];
      const A = curveAngles[i];
      if (!C) return;

      ctx.beginPath();
      for (let k=0; k<=50; k++) {
        const t = k/50;
        const ang = A.start + (A.end - A.start)*t;
        const sE = C.east + R*Math.cos(ang);
        const sN = C.north + R*Math.sin(ang);
        const cx = toCanvasX(sE),
              cy = toCanvasY(sN);
        if (k===0) ctx.moveTo(cx, cy);
        else       ctx.lineTo(cx, cy);
      }
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();

    } else {
      // Straight line
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'blue';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  });

  // 7f) Draw red dots at each vertex
  coords.forEach(pt => {
    const px = toCanvasX(pt.east),
          py = toCanvasY(pt.north);
    ctx.beginPath();
    ctx.arc(px, py, 2, 0, 2*Math.PI);
    ctx.fillStyle = 'red';
    ctx.fill();
  });
}

// Optionally pre-populate on load
window.onload = () => {
  // addLine('Straight','359.5222','15.830');
  // addLine('Straight','112.1529','74.890');
  // addLine('Straight','90.2412','35.735');
  // addLine('Straight','90.2412','0.100');
  // addLine('Straight','179.5220','13.129');
  // addLine('Curve','358.3719','109.569','206.106','R');
};
