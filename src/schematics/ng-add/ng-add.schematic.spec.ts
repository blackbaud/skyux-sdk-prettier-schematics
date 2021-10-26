import {
  SchematicTestRunner,
  UnitTestTree,
} from '@angular-devkit/schematics/testing';

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
      `No ${eslintConfigPath} file found in workspace root. ESLint must be installed and configured before installing Prettier. See https://github.com/angular-eslint/angular-eslint#readme for instructions.`
    );
  });

  it('should install the expected packages', async () => {
    const updatedTree = await runSchematic(tree);

    const packageJson = JSON.parse(updatedTree.readContent('package.json'));
    const deps = packageJson.devDependencies;

    expect(deps['prettier']).toBe('2.4.1');
    expect(deps['@trivago/prettier-plugin-sort-imports']).toBe('2.0.4');
    expect(deps['eslint-config-prettier']).toBe('8.3.0');
  });

  it('should write Prettier config', async () => {
    const updatedTree = await runSchematic(tree);

    const prettierConfig = JSON.parse(
      updatedTree.readContent('.prettierrc.json')
    );

    expect(prettierConfig).toEqual({
      importOrder: ['^@(.*)$', '^\\w(.*)$', '^(../)(.*)$', '^(./)(.*)$'],
      importOrderSeparation: true,
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
package-lock.json`);
  });

  it('should configure ESLint if an .eslintrc.json file exists', async () => {
    tree.overwrite(
      eslintConfigPath,
      JSON.stringify({
        overrides: {
          extends: ['foo'],
        },
      })
    );

    const updatedTree = await runSchematic(tree);

    const eslintConfig = JSON.parse(updatedTree.readContent(eslintConfigPath));

    expect(eslintConfig).toEqual({
      overrides: {
        extends: ['foo', 'prettier'],
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

    const extensions = JSON.parse(
      updatedTree.readContent('.vscode/extensions.json')
    );

    const settings = JSON.parse(
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
