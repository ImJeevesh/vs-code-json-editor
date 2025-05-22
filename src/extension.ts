import * as vscode from 'vscode';
import * as jsoncParser from 'jsonc-parser';
import { CodeJsonTreeProvider } from './providers/code-json-tree-provider';
import { CodeJsonWebProvider } from './providers/code-json-web-provider';

// Function to format (prettify) the active JSON document
function formatJsonDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active text editor.');
    return;
  }

  if (editor.document.languageId !== 'json' && editor.document.languageId !== 'jsonc') {
    vscode.window.showErrorMessage('Active document is not a JSON or JSONC file.');
    return;
  }

  const text = editor.document.getText();
  try {
    const parsedJson = jsoncParser.parse(text);
    const formattedText = JSON.stringify(parsedJson, null, 2);
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(text.length)
    );

    editor.edit(editBuilder => {
      editBuilder.replace(fullRange, formattedText);
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Error formatting JSON: ${error.message}`);
  }
}

// Function to minify the active JSON document
function minifyJsonDocument() {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showErrorMessage('No active text editor.');
    return;
  }

  if (editor.document.languageId !== 'json' && editor.document.languageId !== 'jsonc') {
    vscode.window.showErrorMessage('Active document is not a JSON or JSONC file.');
    return;
  }

  const text = editor.document.getText();
  try {
    const parsedJson = jsoncParser.parse(text);
    const minifiedText = JSON.stringify(parsedJson);
    const fullRange = new vscode.Range(
      editor.document.positionAt(0),
      editor.document.positionAt(text.length)
    );

    editor.edit(editBuilder => {
      editBuilder.replace(fullRange, minifiedText);
    });
  } catch (error) {
    vscode.window.showErrorMessage(`Error minifying JSON: ${error.message}`);
  }
}

export function activate(_context: vscode.ExtensionContext) {
  const treeDataProvider = new CodeJsonTreeProvider();
  const webProvider = new CodeJsonWebProvider(_context.extensionUri);

  const treeView = vscode.window.createTreeView('code-json-editor', {
    treeDataProvider,
    showCollapseAll: true,
  });

  _context.subscriptions.push(
    // treeDataProvider
    treeDataProvider.registerSubscriptions(),
    vscode.window.onDidChangeTextEditorSelection(() => treeDataProvider.onDidChangeTextEditorSelection(treeView)),
    // webProvider
    webProvider.registerSubscriptions(),
    vscode.window.registerWebviewViewProvider('code-json-editor.web-view', webProvider),

    // Register the formatting and minifying commands
    vscode.commands.registerCommand('code-json-editor.formatJsonDocument', formatJsonDocument),
    vscode.commands.registerCommand('code-json-editor.minifyJsonDocument', minifyJsonDocument)
  );
  console.log('Congratulations, your extension "code-json-editor" is now ready!');
}

export function deactivate() {}
