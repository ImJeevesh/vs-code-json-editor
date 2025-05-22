import * as vscode from 'vscode';
import * as parser from 'jsonc-parser';
import { CJEEvent } from '../models/cje-event';

function getNonce() {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}

export class CodeJsonWebProvider implements vscode.WebviewViewProvider {
  private _webviewView: vscode.WebviewView | undefined;
  private _html: string | undefined;
  private _json: any;
  private _textEditor: vscode.TextEditor | undefined; 

  private get _webview(): vscode.Webview {
    return this._webviewView!.webview;
  }

  private get _rootPathUri(): vscode.Uri {
    return vscode.Uri.joinPath(this._extensionUri, 'src', 'web-root');
  }

  constructor(private _extensionUri: vscode.Uri) {}

  async resolveWebviewView(
    _webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): Promise<void> {
    this._webviewView = _webviewView;
    this._webview.options = {
      enableScripts: true,
      enableCommandUris: true,
      localResourceRoots: [this._rootPathUri],
    };

    this._webview.onDidReceiveMessage(data => this._onDidReceiveMessage(data));
    this._webview.html = await this._getHtml();
  }

  refreshJson(): void {
    this._textEditor = vscode.window.activeTextEditor;

    if (this._textEditor?.document) {
      this._json = parser.parse(this._textEditor.document.getText());
      this._updateJsonToWebview();
    }
  }

  registerSubscriptions(): vscode.Disposable {
    return vscode.Disposable.from(
      vscode.window.onDidChangeActiveTextEditor(() => this.onDidChangeActiveTextEditor()),
      vscode.workspace.onDidChangeTextDocument(e => this.onDidChangeTextDocument(e)),
    );
  }

  onDidChangeActiveTextEditor(): void {
    this.refreshJson();
  }

  onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
    if (event.document.uri.toString() === this._textEditor?.document.uri.toString()) {
      this.refreshJson();
    }
  }

  private _onDidReceiveMessage(data: CJEEvent): vscode.Disposable | void {
    switch (data.type) {
      case 'get-initial-json':
        this.refreshJson();
        break;
      case 'execute-command':
        if (data.arguments && data.arguments.length > 0) {
          const commandId = data.arguments[0] as string;
          vscode.commands.executeCommand(commandId);
        }
        break;
      case 'edit-json-value':
        if (!this._textEditor) {
          vscode.window.showErrorMessage('No active JSON editor to apply changes to.');
          return;
        }
        if (!data.payload || data.payload.path === undefined || data.payload.newValue === undefined) {
          vscode.window.showErrorMessage('Invalid payload for JSON edit.');
          return;
        }

        try {
          const documentText = this._textEditor.document.getText();
          const pathSegments = data.payload.path as parser.JSONPath; // data.payload.path is already an array
          let parsedNewValue: any;

          try {
            parsedNewValue = JSON.parse(data.payload.newValue as string);
          } catch (e) {
            // If parsing fails (e.g., for a raw string like "hello" vs "\"hello\""),
            // treat it as a literal string.
            parsedNewValue = data.payload.newValue as string;
          }

          // Determine editor's indentation settings for formattingOptions
          const editorOptions = vscode.window.activeTextEditor?.options;
          const insertSpaces = editorOptions?.insertSpaces as boolean ?? true; // Default to true if undefined
          const tabSize = editorOptions?.tabSize as number ?? 2; // Default to 2 if undefined


          const edits = parser.modify(
            documentText,
            pathSegments,
            parsedNewValue,
            {
              formattingOptions: {
                insertSpaces: insertSpaces,
                tabSize: tabSize,
                // insertFinalNewline: vscode.workspace.getConfiguration('files').get('insertFinalNewline') || false, // Example
              }
            }
          );

          if (edits.length === 0) {
            // This can happen if the value is identical to what's already there.
            // No actual edit is needed.
            console.log('No changes detected for JSON edit.');
            // Optionally, still refresh the webview if the internal state might be out of sync
            // or if the user experience benefits from a confirmation, though usually not needed here.
            // this.refreshJson(); // Might be redundant
            return;
          }

          const updatedText = parser.applyEdits(documentText, edits);

          const document = this._textEditor.document;
          const firstLine = document.lineAt(0);
          const lastLine = document.lineAt(document.lineCount - 1);
          const fullRange = new vscode.Range(firstLine.range.start, lastLine.range.end);

          this._textEditor.edit(editBuilder => {
            editBuilder.replace(fullRange, updatedText);
          }).then(success => {
            if (success) {
              console.log('JSON edit applied successfully.');
              // this.refreshJson(); // This should be triggered by onDidChangeTextDocument
            } else {
              vscode.window.showErrorMessage('Failed to apply JSON edit to the document.');
            }
          }, (error) => {
            console.error('Error applying edit:', error);
            vscode.window.showErrorMessage(`Error applying JSON edit: ${error.message || error}`);
          });

        } catch (error) {
          console.error('Failed to process JSON edit:', error);
          vscode.window.showErrorMessage(`Failed to process JSON edit: ${error.message || error}`);
        }
        break;
    }
  }

  private _updateJsonToWebview() {
    this._webview.postMessage(<CJEEvent> { type: 'json', arguments: [this._json] });
  }

  private async _getHtml() {
    if (this._html) {
      return this._html;
    }

    const nonce = getNonce();
    const stylesUri = this._webview.asWebviewUri(vscode.Uri.joinPath(this._rootPathUri, 'styles.css'));
    const mainJsUri = this._webview.asWebviewUri(vscode.Uri.joinPath(this._rootPathUri, 'main.js'));

    // TODO: automate this
    const libJsonataUri = this._webview.asWebviewUri(vscode.Uri.joinPath(this._rootPathUri, 'libs', 'jsonata.js'));

    // TODO: move to index.html and gen build system
    this._html = `
    <!DOCTYPE html>
			<html lang="en">
			<head>
				<meta charset="UTF-8">
				<!--
					Use a content security policy to only allow loading images from https or from our extension directory,
					and only allow scripts that have a specific nonce.
				-->
				<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${this._webview.cspSource}; script-src 'nonce-${nonce}';">
				<meta name="viewport" content="width=device-width, initial-scale=1.0">
				<link href="${stylesUri}" rel="stylesheet">
				
				<title>Code JSON Editor</title>
			</head>
			<body>
        <div id="app">
          <h5>Under Development!</h5>
          <div id="json-display-area"></div>
          <div id="search-section">
            <input type="text" id="search-input" placeholder="JSONPath or JSONata query..."/>
            <button id="search-button">Search</button>
            <div id="search-results"></div>
          </div>
          <div id="format-actions">
            <button id="format-json-button">Prettify JSON</button>
            <button id="minify-json-button">Minify JSON</button>
          </div>
          <div id="manipulation-actions">
            {/* <!-- Add manipulation controls here later --> */}
          </div>
          <div id="jsonata-playground">
            <div id="jsonata">
              <textarea id="jsonata-expression">webapp</textarea>
              <button id="jsonata-evaluate-btn">Evaluate</button>
              <pre id="jsonata-result"></pre>
            </div>
          </div>
        </div>
				<script nonce="${nonce}" src="${mainJsUri}"></script>
				<script nonce="${nonce}" src="${libJsonataUri}"></script>
			</body>
			</html>
    `;
    return this._html;
  }
}
