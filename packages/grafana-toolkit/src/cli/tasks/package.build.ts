import execa = require('execa');
// @ts-ignore
import * as fs from 'fs';
// @ts-ignore
import * as path from 'path';
import { changeCwdToGrafanaUi, restoreCwd, changeCwdToPackage } from '../utils/cwd';
import chalk from 'chalk';
import { useSpinner } from '../utils/useSpinner';
import { Task, TaskRunner } from './task';

let distDir: string, cwd: string;

// @ts-ignore
export const clean = useSpinner<void>('Cleaning', async () => await execa('npm', ['run', 'clean']));

// @ts-ignore
const compile = useSpinner<void>('Compiling sources', () => execa('tsc', ['-p', './tsconfig.build.json']));

// @ts-ignore
const rollup = useSpinner<void>('Bundling', () => execa('npm', ['run', 'bundle']));

interface SavePackageOptions {
  path: string;
  pkg: {};
}

// @ts-ignore
export const savePackage = useSpinner<SavePackageOptions>(
  'Updating package.json',
  // @ts-ignore
  async ({ path, pkg }: SavePackageOptions) => {
    return new Promise((resolve, reject) => {
      fs.writeFile(path, JSON.stringify(pkg, null, 2), err => {
        if (err) {
          reject(err);
          return;
        }
        resolve();
      });
    });
  }
);

const preparePackage = async (pkg: any) => {
  pkg.main = 'index.js';
  pkg.types = 'index.d.ts';
  await savePackage({
    path: `${cwd}/dist/package.json`,
    pkg,
  });
};

const moveFiles = () => {
  const files = ['README.md', 'CHANGELOG.md', 'index.js'];
  // @ts-ignore
  return useSpinner<void>(`Moving ${files.join(', ')} files`, async () => {
    const promises = files.map(file => {
      return new Promise((resolve, reject) => {
        fs.copyFile(`${cwd}/${file}`, `${distDir}/${file}`, err => {
          if (err) {
            reject(err);
            return;
          }
          resolve();
        });
      });
    });

    await Promise.all(promises);
  })();
};

interface PackageBuildOptions {
  scope: string;
}

const buildTaskRunner: TaskRunner<PackageBuildOptions> = async ({ scope }) => {
  if (!scope) {
    throw new Error('Provide packages with -s, --scope <packages>');
  }

  const scopes = scope.split(',').map(s => {
    return async () => {
      cwd = path.resolve(__dirname, `../../../../grafana-${s}`);
      // Lerna executes this in package's dir context, but for testing purposes I want to be able to run from root:
      // grafana-toolkit package:build --scope=<package>
      process.chdir(cwd);
      distDir = `${cwd}/dist`;
      const pkg = require(`${cwd}/package.json`);
      console.log(chalk.yellow(`Building ${pkg.name} (package.json version: ${pkg.version})`));

      await clean();
      await compile();
      await rollup();
      await preparePackage(pkg);
      await moveFiles();
    };
  });

  await Promise.all(scopes.map(s => s()));
};

export const buildPackageTask = new Task<PackageBuildOptions>('@grafana/ui build', buildTaskRunner);
