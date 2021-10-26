import { normalize } from '@angular-devkit/core';
import {
  ProjectDefinition,
  WorkspaceDefinition,
} from '@angular-devkit/core/src/workspace';
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

import commentJson from 'comment-json';
import path from 'path';

import { readRequiredFile } from '../utility/tree';
import { getWorkspace } from '../utility/workspace';

import { ESLintConfig } from './types/eslint-config';
import { VSCodeExtensions } from './types/vscode-extensions';
import { VSCodeSettings } from './types/vscode-settings';

function readJsonFile<T>(tree: Tree, path: string): T {
  if (tree.exists(path)) {
    return commentJson.parse(readRequiredFile(tree, path));
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
  writeTextFile(tree, path, commentJson.stringify(contents, undefined, 2));
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
package-lock.json
test.ts`
    );

    return tree;
  };
}

function configureESLint(workspace: WorkspaceDefinition): Rule {
  return (tree, context) => {
    const fileName = '.eslintrc.json';
    const updatedESLintConfigs: { [key: string]: boolean } = {};

    function addPrettierPluginToESLintConfig(eslintConfigPath: string): void {
      if (updatedESLintConfigs[eslintConfigPath]) {
        context.logger.info(
          `${eslintConfigPath} has already been configured with Prettier. Skipping...`
        );
      } else if (tree.exists(eslintConfigPath)) {
        context.logger.info(`Found ${eslintConfigPath}...`);

        const eslintConfig = readJsonFile<ESLintConfig>(tree, eslintConfigPath);

        if (eslintConfig.extends) {
          const parentFolder = path.dirname(eslintConfigPath);
          const extendsPath = normalize(
            `${parentFolder}/${eslintConfig.extends}`
          );

          context.logger.info(
            `${eslintConfigPath} extends ${extendsPath}. Configuring the extended file...`
          );

          if (!tree.exists(extendsPath)) {
            throw new SchematicsException(
              `${eslintConfigPath} extends ${extendsPath}, but ${extendsPath} was not found in the workspace.`
            );
          }

          addPrettierPluginToESLintConfig(extendsPath);
        } else {
          eslintConfig.overrides = eslintConfig.overrides || {};
          eslintConfig.overrides.extends = eslintConfig.overrides.extends || [];
          eslintConfig.overrides.extends.push('prettier');

          writeJsonFile(tree, eslintConfigPath, eslintConfig);
          updatedESLintConfigs[eslintConfigPath] = true;
        }
      }
    }

    context.logger.info('Configuring ESLint Prettier plugin...');

    const projects = workspace.projects.values();
    let project: ProjectDefinition;

    while ((project = projects.next().value)) {
      addPrettierPluginToESLintConfig(normalize(`${project.root}/${fileName}`));
    }

    addPrettierPluginToESLintConfig(fileName);

    if (Object.keys(updatedESLintConfigs).length === 0) {
      throw new SchematicsException(
        `No ${fileName} file found in workspace. ESLint must be installed and configured before installing Prettier. See https://github.com/angular-eslint/angular-eslint#readme for instructions.`
      );
    }
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
  return async (tree) => {
    const { workspace } = await getWorkspace(tree);

    return chain([
      configureESLint(workspace),
      addPrettierDependencies(),
      writePrettierConfig(),
      writePrettierIgnore(),
      configureVSCode(),
      (_tree, context) => {
        context.addTask(new NodePackageInstallTask());
      },
    ]);
  };
}
