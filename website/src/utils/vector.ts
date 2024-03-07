export function rotateAround(origin: Coord, point: Coord, angle: number): Coord {
    const [originX, originY] = origin;
    const [x, y] = point;

    // Translate the point to the origin
    const translatedX = x - originX;
    const translatedY = y - originY;

    // Apply rotation using trigonometric functions
    const cosAngle = Math.cos(angle);
    const sinAngle = Math.sin(angle);
    const rotatedX = translatedX * cosAngle - translatedY * sinAngle;
    const rotatedY = translatedX * sinAngle + translatedY * cosAngle;

    // Translate back to the original position
    const newX = rotatedX + originX;
    const newY = rotatedY + originY;

    return [newX, newY];
}

export function angleFromXAxis(origin: Coord, point: Coord): number {
    const [originX, originY] = origin;
    const [x, y] = point;

    const deltaX = x - originX;
    const deltaY = y - originY;

    return Math.atan2(deltaY, deltaX) * (180 / Math.PI);
}

export function distanceBetweenPoints(point1: Coord, point2: Coord): number {
    const [x1, y1] = point1;
    const [x2, y2] = point2;

    const deltaX = x2 - x1;
    const deltaY = y2 - y1;

    return Math.sqrt(deltaX ** 2 + deltaY ** 2);
}

export function magnitude(vector: Coord): number {
    const [x, y] = vector;
    return Math.sqrt(x ** 2 + y ** 2);
}


export const add = (a: Coord, b: Coord): Coord => [a[0] + b[0], a[1] + b[1]];
export const multiply = (a: Coord, b: number): Coord => [a[0] * b, a[1] * b];
export const divide = (a: Coord, b: number): Coord => [a[0] / b, a[1] / b];
