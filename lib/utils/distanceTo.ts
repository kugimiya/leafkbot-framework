import { Vec3 } from 'vec3';

const distanceTo = (position0: Vec3, position1: Vec3): number => {
  let distanceToBlk = Math.sqrt(
    Math.pow(position0.x - position1.x, 2)
    + Math.pow(position0.z - position1.z, 2)
  );

  distanceToBlk = Math.round(distanceToBlk * 1000) / 1000;

  return distanceToBlk;
}

export default distanceTo;
