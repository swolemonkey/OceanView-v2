import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import { prisma } from '../../../db.js';

const exec = promisify(execCallback);

export async function retrainGatekeeper() {
  await exec('pnpm ts-node scripts/export_rl_dataset.ts');
  await exec('python ml/train_gatekeeper.py --output ml/tmp.onnx');
  const { stdout } = await exec('sha1sum ml/tmp.onnx');
  const ver = 'gatekeeper_'+stdout.split(' ')[0].slice(0,8);
  await prisma.rLModel.create({ data:{ version:ver, path:'ml/tmp.onnx', description:'auto-retrain' }});
} 