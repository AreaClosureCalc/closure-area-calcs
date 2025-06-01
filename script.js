// Converts D.MMSS to decimal degrees
function dmsToDecimal(deg) {
    const d = Math.floor(deg);
    const m = Math.floor((deg - d) * 100);
    const s = ((deg - d) * 100 - m) * 100;
    return d + m / 60 + s / 3600;
}

// Converts bearing to radians
function bearingToRadians(bearing) {
    return dmsToDecimal(bearing) * Math.PI / 180;
}

// Converts polar to rectangular (deltaE, deltaN)
function polarToRect(bearingRad, distance) {
    return {
        dx: distance * Math.sin(bearingRad),
        dy: distance * Math.cos(bearingRad)
    };
}

// Computes chord bearing and length from curve info
function curveToChord(bearing, arc, radius, dir) {
    const deltaRad = arc / radius;
    const chord = 2 * radius * Math.sin(deltaRad / 2);
    const tangent = radius * Math.tan(deltaRad / 2);
    const offsetAngle = (dir === 'R' ? 1 : -1) * deltaRad / 2;
    const brgRad = bearingToRadians(bearing) + offsetAngle;
    return {
        chordLength: chord,
        chordBearingRad: brgRad
    };
}

// Calculate closure and area
function calculateClosure(lines) {
    let x = 0, y = 0;
    let coords = [{ x, y }];
    let area = 0;

    for (const line of lines) {
        let dx = 0, dy = 0;

        if (line.type === 'Straight') {
            const brgRad = bearingToRadians(line.bearing);
            ({ dx, dy } = polarToRect(brgRad, line.length));
        } else if (line.type === 'Curve') {
            const { chordLength, chordBearingRad } = curveToChord(line.bearing, line.length, line.radius, line.dir);
            ({ dx, dy } = polarToRect(chordBearingRad, chordLength));
        }

        x += dx;
        y += dy;
        coords.push({ x, y });
    }

    // Area using shoelace formula
    for (let i = 0; i < coords.length - 1; i++) {
        area += coords[i].x * coords[i + 1].y - coords[i + 1].x * coords[i].y;
    }
    area = Math.abs(area / 2);

    const closureError = Math.hypot(coords[coords.length - 1].x, coords[coords.length - 1].y);

    return { coords, area, closureError };
}
