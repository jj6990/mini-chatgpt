import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

// Create a root element for rendering
const root = ReactDOM.createRoot(document.getElementById('root') as HTMLElement);

// Render the App component inside the root element
root.render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
