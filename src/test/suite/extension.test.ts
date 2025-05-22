import * as assert from 'assert';

// You can import and use all API from the 'vscode' module
// as well as import your extension to test it
import * as vscode from 'vscode';
// import * as myExtension from '../../extension';

suite('Extension Test Suite', () => {
  vscode.window.showInformationMessage('Start all tests.');

  test('Sample test', () => {
    assert.strictEqual(-1, [1, 2, 3].indexOf(5));
    assert.strictEqual(-1, [1, 2, 3].indexOf(0));
  });
});

// Helper function to apply a command to text and get the result
async function applyCommandToText(language: string, initialContent: string, commandName: string): Promise<string> {
  const document = await vscode.workspace.openTextDocument({ content: initialContent, language });
  const editor = await vscode.window.showTextDocument(document);
  
  // It's good practice to wait a short moment for the language features to activate,
  // especially if the command relies on language-specific parsing or features.
  await new Promise(resolve => setTimeout(resolve, 500)); 

  await vscode.commands.executeCommand(commandName);
  const newText = editor.document.getText();
  
  // Close the document without saving
  await vscode.commands.executeCommand('workbench.action.closeActiveEditor');
  return newText;
}

suite('Formatting Commands Test Suite', () => {
  const defaultTabSize = 2; // As configured in formatJsonDocument and minifyJsonDocument

  test('Prettify JSON document using code-json-editor.formatJsonDocument', async () => {
    const minifiedJson = '{"foo":"bar","baz":[1,2,3],"nested":{"a":true,"b":null}}';
    const expectedFormattedJson = JSON.stringify(JSON.parse(minifiedJson), null, defaultTabSize);
    
    const actualFormattedJson = await applyCommandToText('json', minifiedJson, 'code-json-editor.formatJsonDocument');
    assert.strictEqual(actualFormattedJson, expectedFormattedJson, 'JSON should be prettified.');
  });

  test('Minify JSON document using code-json-editor.minifyJsonDocument', async () => {
    const formattedJson = `{
  "foo": "bar",
  "baz": [
    1,
    2,
    3
  ],
  "nested": {
    "a": true,
    "b": null
  }
}`;
    const expectedMinifiedJson = JSON.stringify(JSON.parse(formattedJson));

    const actualMinifiedJson = await applyCommandToText('json', formattedJson, 'code-json-editor.minifyJsonDocument');
    assert.strictEqual(actualMinifiedJson, expectedMinifiedJson, 'JSON should be minified.');
  });

  test('Format JSONC document with comments using code-json-editor.formatJsonDocument', async () => {
    const jsoncWithComments = `
{
  // comment before foo
  "foo": "bar", // comment next to bar
  "baz": [1,2,3], // comment at end of array line
  "complex": { // comment for object
    "item": "value" // comment for item
  }
  // comment at the end
}`;
    // Expected output after formatting (jsonc-parser preserves comments and their relative positions)
    // The exact indentation of comments can sometimes vary based on parser logic,
    // but their presence and relative order to tokens is key.
    const expectedFormattedJsonc = `{
  // comment before foo
  "foo": "bar", // comment next to bar
  "baz": [
    1,
    2,
    3
  ], // comment at end of array line
  "complex": { // comment for object
    "item": "value" // comment for item
  }
  // comment at the end
}`;

    const actualFormattedJsonc = await applyCommandToText('jsonc', jsoncWithComments, 'code-json-editor.formatJsonDocument');
    // Normalizing line endings for comparison, as getText() might use platform specific endings
    assert.strictEqual(actualFormattedJsonc.replace(/\r\n/g, '\n'), expectedFormattedJsonc.replace(/\r\n/g, '\n'), 'JSONC should be formatted with comments preserved.');
  });

  test('Format JSON document with editor specific tabSize=4', async () => {
    const minifiedJson = '{"foo":"bar","baz":[1,2,3]}';
    const expectedFormattedJson = JSON.stringify(JSON.parse(minifiedJson), null, 4); // Expect 4 spaces

    // Temporarily set workspace configuration for tabSize for this test
    const originalTabSize = vscode.workspace.getConfiguration('editor').get('tabSize');
    await vscode.workspace.getConfiguration('editor').update('tabSize', 4, vscode.ConfigurationTarget.Global);

    const actualFormattedJson = await applyCommandToText('json', minifiedJson, 'code-json-editor.formatJsonDocument');
    
    // Restore original tabSize
    await vscode.workspace.getConfiguration('editor').update('tabSize', originalTabSize, vscode.ConfigurationTarget.Global);

    assert.strictEqual(actualFormattedJson, expectedFormattedJson, 'JSON should be prettified with 4 spaces.');
  });

   test('Format JSON document with editor specific insertSpaces=false (tabs)', async () => {
    const minifiedJson = '{"foo":"bar","baz":[1,2,3]}';
    // Note: JSON.stringify with a string in the third argument uses that string for indentation.
    // For tabs, it's a bit tricky as it depends on the editor's display of \t.
    // The key is that the command should be respecting the setting.
    // We'll check if the output contains tabs.
    const expectedFormattedJsonWithTabs = JSON.stringify(JSON.parse(minifiedJson), null, '\t');


    const originalInsertSpaces = vscode.workspace.getConfiguration('editor').get('insertSpaces');
    await vscode.workspace.getConfiguration('editor').update('insertSpaces', false, vscode.ConfigurationTarget.Global);
    
    // If tabSize is not also set, it might default to something unexpected with tabs.
    // Let's also set a known tabSize for consistency if using tabs.
    const originalTabSize = vscode.workspace.getConfiguration('editor').get('tabSize');
    await vscode.workspace.getConfiguration('editor').update('tabSize', 1, vscode.ConfigurationTarget.Global); // Using 1 tab per level


    const actualFormattedJson = await applyCommandToText('json', minifiedJson, 'code-json-editor.formatJsonDocument');
    
    await vscode.workspace.getConfiguration('editor').update('insertSpaces', originalInsertSpaces, vscode.ConfigurationTarget.Global);
    await vscode.workspace.getConfiguration('editor').update('tabSize', originalTabSize, vscode.ConfigurationTarget.Global);

    assert.strictEqual(actualFormattedJson, expectedFormattedJsonWithTabs, 'JSON should be prettified with tabs.');
    assert.ok(actualFormattedJson.includes('\t'), 'Formatted JSON should contain tab characters.');
  });

});
