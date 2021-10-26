import {
  chain,
  Rule,
  SchematicsException,
  Tree,
} from '@angular-devkit/schematics';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';
import {
  addPackageJsonDependency,
  NodeDependencyType,
} from '@schematics/angular/utility/dependencies';

import { readRequiredFile } from '../utility/tree';

import { ESLintConfig } from './types/eslint-config';
import { VSCodeExtensions } from './types/vscode-extensions';
import { VSCodeSettings } from './types/vscode-settings';

function readJsonFile<T>(tree: Tree, path: string): T {
  if (tree.exists(path)) {
    return JSON.parse(readRequiredFile(tree, path));
  }

  return {} as T;
}

function writeTextFile(tree: Tree, path: string, contents: string): void {
  if (tree.exists(path)) {
    tree.overwrite(path, contents);
  } else {
    tree.create(path, contents);
  }
}

function writeJsonFile<T>(tree: Tree, path: string, contents: T): void {
  writeTextFile(tree, path, JSON.stringify(contents, undefined, 2));
}

function validateWorkspace(): Rule {
  return (tree) => {
    const filePath = '.eslintrc.json';

    if (!tree.exists(filePath)) {
      throw new SchematicsException(
        `No ${filePath} file found in workspace root. ESLint must be installed and configured before installing Prettier. See https://github.com/angular-eslint/angular-eslint#readme for instructions.`
      );
    }
  };
}

function addPrettierDependencies(): Rule {
  return (tree, context) => {
    context.logger.info('Adding Prettier dependencies...');

    addPackageJsonDependency(tree, {
      name: 'prettier',
      type: NodeDependencyType.Dev,
      version: '2.4.1',
      overwrite: true,
    });

    addPackageJsonDependency(tree, {
      name: '@trivago/prettier-plugin-sort-imports',
      type: NodeDependencyType.Dev,
      version: '2.0.4',
      overwrite: true,
    });

    addPackageJsonDependency(tree, {
      name: 'eslint-config-prettier',
      type: NodeDependencyType.Dev,
      version: '8.3.0',
      overwrite: true,
    });

    return tree;
  };
}

function writePrettierConfig(): Rule {
  return (tree, context) => {
    const filePath = '.prettierrc.json';

    context.logger.info(`Creating ${filePath} file with default settings...`);

    const prettierConfig = {
      importOrder: ['^@(.*)$', '^\\w(.*)$', '^(../)(.*)$', '^(./)(.*)$'],
      importOrderSeparation: true,
      singleQuote: true,
    };

    writeJsonFile(tree, filePath, prettierConfig);

    return tree;
  };
}

function writePrettierIgnore(): Rule {
  return (tree, context) => {
    const filePath = '.prettierignore';

    context.logger.info(
      `Creating ${filePath} file with commonly-ignored paths...`
    );

    writeTextFile(
      tree,
      filePath,
      `# Ignore artifacts:
.github
.nyc_output
coverage
dist
node_modules
package-lock.json`
    );

    return tree;
  };
}

function configureESLint(): Rule {
  return (tree, context) => {
    const filePath = '.eslintrc.json';

    context.logger.info('Configuring ESLint Prettier plugin...');

    const eslintConfig = readJsonFile<ESLintConfig>(tree, filePath);

    eslintConfig.overrides = eslintConfig.overrides || {};
    eslintConfig.overrides.extends = eslintConfig.overrides.extends || [];
    eslintConfig.overrides.extends.push('prettier');

    writeJsonFile(tree, filePath, eslintConfig);

    return tree;
  };
}

function configureVSCode(): Rule {
  return (tree, context) => {
    const vsCodePath = '.vscode';
    const extensionsPath = `${vsCodePath}/extensions.json`;
    const settingsPath = `${vsCodePath}/settings.json`;
    const prettierExtensionName = 'esbenp.prettier-vscode';

    if (tree.getDir('.vscode').subfiles.length) {
      context.logger.info(
        `Found files in ${vsCodePath} folder. Configuring Visual Studio Code for Prettier extension...`
      );

      const extensions = readJsonFile<VSCodeExtensions>(tree, extensionsPath);
      const settings = readJsonFile<VSCodeSettings>(tree, settingsPath);

      context.logger.info(
        'Adding Prettier extension to recommended extensions...'
      );

      extensions.recommendations = extensions.recommendations || [];
      extensions.recommendations.push(prettierExtensionName);

      writeJsonFile(tree, extensionsPath, extensions);

      context.logger.info(
        'Setting Prettier as default formatter for workspace...'
      );

      settings['editor.defaultFormatter'] = prettierExtensionName;
      settings['editor.formatOnSave'] = true;
      settings['prettier.requireConfig'] = true;

      writeJsonFile(tree, settingsPath, settings);
    }

    return tree;
  };
}

export default function ngAdd(): Rule {
  return () => {
    return chain([
      validateWorkspace(),
      addPrettierDependencies(),
      writePrettierConfig(),
      writePrettierIgnore(),
      configureESLint(),
      configureVSCode(),
      (_tree, context) => {
        context.addTask(new NodePackageInstallTask());
      },
    ]);
  };
}
