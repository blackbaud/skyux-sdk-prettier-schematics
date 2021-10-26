import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';

import commentJson from 'comment-json';
import path from 'path';

import { createTestLibrary } from '../testing/scaffold';

const COLLECTION_PATH = path.resolve(__dirname, '../../../collection.json');
const eslintConfigPath = '.eslintrc.json';

describe('ng-add.schematic', () => {
  const defaultProjectName = 'my-lib';

  let runner: SchematicTestRunner;
  let tree: UnitTestTree;

  beforeEach(async () => {
    runner = new SchematicTestRunner('schematics', COLLECTION_PATH);

    tree = await createTestLibrary(runner, {
      name: defaultProjectName,
    });

    tree.create(eslintConfigPath, '{}');
  });

  function runSchematic(tree: UnitTestTree): Promise<UnitTestTree> {
    return runner
      .runSchematicAsync(
        'ng-add',
        {
          project: defaultProjectName,
        },
        tree
      )
      .toPromise();
  }

  function validateJsonFile(
    tree: UnitTestTree,
    path: string,
    expectedContents: unknown
  ) {
    const prettierConfig = commentJson.parse(tree.readContent(path));

    expect(prettierConfig).toEqual(expectedContents);
  }

  it('should run the NodePackageInstallTask', async () => {
    await runSchematic(tree);

    expect(runner.tasks.some((task) => task.name === 'node-package')).toEqual(
      true,
      'Expected the schematic to setup a package install step.'
    );
  });

  it('should throw an error if ESLint is not configured.', async () => {
    tree.delete(eslintConfigPath);

    await expectAsync(runSchematic(tree)).toBeRejectedWithError(
      `No ${eslintConfigPath} file found in workspace. ESLint must be installed and configured before installing Prettier. See https://github.com/angular-eslint/angular-eslint#readme for instructions.`
    );
  });

  it('should install the expected packages', async () => {
    const updatedTree = await runSchematic(tree);

    validateJsonFile(
      updatedTree,
      'package.json',
      jasmine.objectContaining({
        devDependencies: jasmine.objectContaining({
          prettier: '2.4.1',
          'eslint-config-prettier': '8.3.0',
        }),
      })
    );
  });

  it('should write Prettier config', async () => {
    const updatedTree = await runSchematic(tree);

    validateJsonFile(updatedTree, '.prettierrc.json', {
      singleQuote: true,
    });
  });

  it('should write Prettier ignore', async () => {
    const updatedTree = await runSchematic(tree);

    const prettierIgnore = updatedTree.readContent('.prettierignore');

    expect(prettierIgnore).toEqual(`# Ignore artifacts:
.github
.nyc_output
coverage
dist
node_modules
package-lock.json
test.ts`);
  });

  it('should configure ESLint if an .eslintrc.json file exists', async () => {
    tree.overwrite(
      eslintConfigPath,
      commentJson.stringify({
        overrides: {
          extends: ['foo'],
        },
      })
    );

    const updatedTree = await runSchematic(tree);

    validateJsonFile(updatedTree, eslintConfigPath, {
      overrides: {
        extends: ['foo', 'prettier'],
      },
    });
  });

  it('should configure ESLint if an .eslintrc.json file exists only in a project', async () => {
    tree.delete(eslintConfigPath);

    const projectEslintConfigPath = `projects/my-lib/${eslintConfigPath}`;

    tree.create(
      projectEslintConfigPath,
      commentJson.stringify({
        overrides: {
          extends: ['foo'],
        },
      })
    );

    const updatedTree = await runSchematic(tree);

    validateJsonFile(updatedTree, projectEslintConfigPath, {
      overrides: {
        extends: ['foo', 'prettier'],
      },
    });
  });

  it('should not update an .eslintrc.json file that extends another .eslintrc.json file', async () => {
    const projectEslintConfigPath = `projects/my-lib/${eslintConfigPath}`;

    tree.create(
      projectEslintConfigPath,
      commentJson.stringify({
        extends: '../../.eslintrc.json',
        overrides: {
          extends: ['bar'],
        },
      })
    );

    const updatedTree = await runSchematic(tree);

    validateJsonFile(updatedTree, projectEslintConfigPath, {
      extends: '../../.eslintrc.json',
      overrides: {
        extends: ['bar'],
      },
    });

    validateJsonFile(updatedTree, eslintConfigPath, {
      overrides: {
        extends: ['prettier'],
      },
    });
  });

  it("should configure a project's .eslintrc.json file when it extends an .eslintrc.json file that does not exist", async () => {
    const projectEslintConfigPath = `projects/my-lib/${eslintConfigPath}`;

    tree.create(
      projectEslintConfigPath,
      commentJson.stringify({
        extends: '../.eslintrc.json',
        overrides: {
          extends: ['bar'],
        },
      })
    );

    const updatedTree = await runSchematic(tree);

    validateJsonFile(updatedTree, projectEslintConfigPath, {
      extends: '../.eslintrc.json',
      overrides: {
        extends: ['bar', 'prettier'],
      },
    });
  });

  it('should not configure VSCode if .vscode folder does not exist', async () => {
    const updatedTree = await runSchematic(tree);

    expect(updatedTree.exists('.vscode/extensions.json')).toBeFalse();
  });

  it('should configure VSCode if files exist in the .vscode folder', async () => {
    tree.create('.vscode/extensions.json', '{}');

    const updatedTree = await runSchematic(tree);

    const extensions = commentJson.parse(
      updatedTree.readContent('.vscode/extensions.json')
    );

    const settings = commentJson.parse(
      updatedTree.readContent('.vscode/settings.json')
    );

    expect(extensions).toEqual({
      recommendations: ['esbenp.prettier-vscode'],
    });

    expect(settings).toEqual({
      'editor.defaultFormatter': 'esbenp.prettier-vscode',
      'editor.formatOnSave': true,
      'prettier.requireConfig': true,
    });
  });
});
