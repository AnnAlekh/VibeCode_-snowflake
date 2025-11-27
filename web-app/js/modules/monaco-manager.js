// Monaco Editor management module
import { interviewState } from './state.js';

let monacoInitialized = false;

export function initializeMonacoEditor() {
    if (interviewState.editor) {
        // Editor already initialized
        return;
    }
    
    const editorElement = document.getElementById('monaco-editor');
    if (!editorElement) {
        console.error('Monaco editor container not found');
        return;
    }
    
    if (!monacoInitialized) {
        require.config({ paths: { vs: 'https://cdn.jsdelivr.net/npm/monaco-editor@0.44.0/min/vs' } });
        monacoInitialized = true;
    }
    
    require(['vs/editor/editor.main'], function () {
        try {
            interviewState.editor = monaco.editor.create(editorElement, {
                value: '# Напишите ваше решение здесь\n\ndef solution(arr):\n    pass\n',
                language: 'python',
                theme: 'vs-dark',
                fontSize: 14,
                minimap: { enabled: false },
                automaticLayout: true,
                scrollBeyondLastLine: false
            });
            console.log('Monaco Editor initialized successfully');
        } catch (error) {
            console.error('Error initializing Monaco Editor:', error);
        }
    });
}

export function getEditorCode() {
    return interviewState.editor ? interviewState.editor.getValue() : '';
}

export function setEditorCode(code) {
    if (interviewState.editor) {
        interviewState.editor.setValue(code);
    }
}

export function changeLanguage() {
    if (!interviewState.editor) return;
    
    const language = document.getElementById('language-select').value;
    const model = interviewState.editor.getModel();
    if (model) {
        monaco.editor.setModelLanguage(model, language);
    }
}

