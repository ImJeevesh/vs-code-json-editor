(function () {
  const vscode = acquireVsCodeApi();

  window.addEventListener('message', ({ data }) => {
    const { type, arguments } = data;
    switch (type) {
      case 'json':
        updateJsonView(arguments[0]);
        break;
    }
  });

  vscode.postMessage({ type: 'get-initial-json' });

  document.querySelector('#jsonata-evaluate-btn')
    .addEventListener('click', () => evaluateJsonataExpression());

  // Event listeners for format and minify buttons
  const formatButton = document.querySelector('#format-json-button');
  if (formatButton) {
    formatButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'execute-command', arguments: ['code-json-editor.formatJsonDocument'] });
    });
  }

  const minifyButton = document.querySelector('#minify-json-button');
  if (minifyButton) {
    minifyButton.addEventListener('click', () => {
      vscode.postMessage({ type: 'execute-command', arguments: ['code-json-editor.minifyJsonDocument'] });
    });
  }

  // Event listener for the search button
  const searchButton = document.querySelector('#search-button');
  if (searchButton) {
    searchButton.addEventListener('click', () => {
      const queryInput = document.querySelector('#search-input');
      const resultsArea = document.querySelector('#search-results');
      const currentJson = getCurrentState().json; // Use existing helper

      if (!queryInput || !resultsArea) {
        console.error('Search input or results area not found.');
        if(resultsArea) resultsArea.textContent = 'Error: Search UI elements not found.';
        return;
      }
      
      resultsArea.innerHTML = ''; // Clear previous results

      if (!currentJson) {
        resultsArea.textContent = 'No JSON data loaded to search.';
        return;
      }

      const query = queryInput.value.trim();

      if (!query) {
        resultsArea.textContent = 'Please enter a search query.';
        return;
      }

      try {
        const expression = jsonata(query);
        const result = expression.evaluate(currentJson);

        if (result === undefined || (Array.isArray(result) && result.length === 0) || (typeof result === 'object' && Object.keys(result).length === 0 && !Array.isArray(result) && result !== null) ) {
          resultsArea.textContent = 'No results found.';
        } else {
          const preElement = document.createElement('pre');
          preElement.textContent = JSON.stringify(result, null, 2);
          resultsArea.appendChild(preElement);
        }
      } catch (error) {
        console.error('JSONata evaluation error:', error);
        const preElement = document.createElement('pre');
        // Display a more user-friendly error message if possible
        let errorMessage = 'Error evaluating query: ';
        if (error.message) {
            errorMessage += error.message;
        } else {
            errorMessage += 'An unknown error occurred.';
        }
        if (error.position && error.token) {
            errorMessage += ` At position ${error.position} (token: ${error.token})`;
        }
        preElement.textContent = errorMessage;
        resultsArea.appendChild(preElement);
      }
    });
  }

  function getCurrentState() {
    return vscode.getState() || { json: {} };
  }

  function updateJsonView(json) {
    if (json === undefined) {
      // Don't attempt to render if json is undefined
      // but still update the state if necessary or clear the view
      vscode.setState({ json: {} }); 
      const jsonDisplayArea = document.querySelector('#json-display-area');
      if (jsonDisplayArea) {
        jsonDisplayArea.innerHTML = 'No JSON data to display or data is undefined.';
      }
      return;
    }

    const jsonDisplayArea = document.querySelector('#json-display-area');
    if (jsonDisplayArea) {
      jsonDisplayArea.innerHTML = ''; // Clear previous content
      const rootElement = buildJsonHtml(json, []);
      jsonDisplayArea.appendChild(rootElement);
    }
    vscode.setState({ json: json ?? {} });
  }

  function buildJsonHtml(data, currentPath) {
    const type = typeof data;
    const pathStr = JSON.stringify(currentPath);

    if (data === null) {
      const span = document.createElement('span');
      span.className = 'json-value null';
      span.textContent = 'null';
      span.dataset.path = pathStr;
      return span;
    } else if (type === 'string' || type === 'number' || type === 'boolean') {
      const span = document.createElement('span');
      span.className = `json-value ${type}`;
      span.textContent = String(data);
      span.dataset.path = pathStr;
      return span;
    } else if (Array.isArray(data)) {
      const arrayDiv = document.createElement('div');
      arrayDiv.className = 'json-array';
      arrayDiv.appendChild(document.createTextNode('['));

      data.forEach((item, index) => {
        const itemDiv = document.createElement('div');
        itemDiv.className = 'json-array-item';
        itemDiv.appendChild(buildJsonHtml(item, [...currentPath, index]));
        arrayDiv.appendChild(itemDiv);
        if (index < data.length - 1) {
          itemDiv.appendChild(document.createTextNode(','));
        }
      });
      arrayDiv.appendChild(document.createTextNode(']'));
      return arrayDiv;
    } else if (type === 'object') {
      const objectDiv = document.createElement('div');
      objectDiv.className = 'json-object';
      objectDiv.appendChild(document.createTextNode('{'));

      const keys = Object.keys(data);
      keys.forEach((key, index) => {
        const propertyDiv = document.createElement('div');
        propertyDiv.className = 'json-property';

        const keySpan = document.createElement('span');
        keySpan.className = 'json-key';
        keySpan.textContent = `"${key}": `;
        propertyDiv.appendChild(keySpan);

        propertyDiv.appendChild(buildJsonHtml(data[key], [...currentPath, key]));
        objectDiv.appendChild(propertyDiv);

        if (index < keys.length - 1) {
          propertyDiv.appendChild(document.createTextNode(','));
        }
      });
      objectDiv.appendChild(document.createTextNode('}'));
      return objectDiv;
    }
    // Should not happen for valid JSON
    const errorSpan = document.createElement('span');
    errorSpan.textContent = 'Invalid JSON value';
    return errorSpan;
  }

  // Event delegation for clicks on json-value spans
  const jsonDisplayArea = document.querySelector('#json-display-area');
  if (jsonDisplayArea) {
    jsonDisplayArea.addEventListener('click', (event) => {
      const target = event.target;
      if (target && target.classList.contains('json-value')) {
        // Prevent re-triggering if already an input, though this check should be robust
        if (target.tagName === 'SPAN') { 
          makeValueEditable(target);
        }
      }
    });
  }

  function makeValueEditable(spanElement) {
    const currentValue = spanElement.textContent;
    const path = JSON.parse(spanElement.dataset.path); // Path is stored as stringified array

    const inputElement = document.createElement('input');
    inputElement.type = 'text';
    inputElement.value = currentValue;
    inputElement.dataset.path = spanElement.dataset.path; // Preserve path
    inputElement.className = spanElement.className; // Keep original styling if any
    inputElement.classList.remove('json-value'); // Remove to avoid re-triggering click

    spanElement.parentNode.replaceChild(inputElement, spanElement);
    inputElement.focus();

    const handleEditSubmission = () => {
      const newValueText = inputElement.value;
      
      vscode.postMessage({
        type: 'edit-json-value',
        payload: {
          path: path, // This is already an array from JSON.parse
          newValue: newValueText // Send as string, extension handles parsing
        }
      });

      // Replace input with a new span (temporary, ideal is full re-render on success)
      const newSpan = document.createElement('span');
      newSpan.className = inputElement.className; // Preserve type class (number, boolean, etc.)
      newSpan.classList.add('json-value'); // Re-add for future edits
      newSpan.textContent = newValueText;
      newSpan.dataset.path = inputElement.dataset.path;
      inputElement.parentNode.replaceChild(newSpan, inputElement);
    };

    inputElement.addEventListener('blur', handleEditSubmission);
    inputElement.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        handleEditSubmission();
      } else if (event.key === 'Escape') {
        // Revert to original span without saving
        inputElement.parentNode.replaceChild(spanElement, inputElement);
      }
    });
  }

  function evaluateJsonataExpression() {
    const expression = document.querySelector('#jsonata-expression').value;
    console.log(expression, getCurrentState().json);
    document.querySelector('#jsonata-result').innerHTML = JSON.stringify(jsonata(expression).evaluate(getCurrentState().json), null, 2);
  }
})();
