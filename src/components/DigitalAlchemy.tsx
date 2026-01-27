import React, { useState } from 'react';

// Generate a cryptic sigil-like string for folder naming
const generateSigilName = (): string => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const symbols = ['◈', '◇', '△', '▽', '○', '●', '□', '■'];
    let result = symbols[Math.floor(Math.random() * symbols.length)];
    for (let i = 0; i < 8; i++) {
        result += chars[Math.floor(Math.random() * chars.length)];
    }
    result += symbols[Math.floor(Math.random() * symbols.length)];
    return result;
};

// Recursively copy directory contents
async function copyDirectoryContents(
    sourceHandle: FileSystemDirectoryHandle,
    destHandle: FileSystemDirectoryHandle,
    log: (msg: string) => void
) {
    for await (const entry of sourceHandle.values()) {
        if (entry.kind === 'file') {
            const fileHandle = await sourceHandle.getFileHandle(entry.name);
            const file = await fileHandle.getFile();
            const newFileHandle = await destHandle.getFileHandle(entry.name, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
            log(`  ↳ Transferred: ${entry.name}`);
        } else if (entry.kind === 'directory') {
            const subDirHandle = await sourceHandle.getDirectoryHandle(entry.name);
            const newSubDirHandle = await destHandle.getDirectoryHandle(entry.name, { create: true });
            log(`  ↳ Entering: ${entry.name}/`);
            await copyDirectoryContents(subDirHandle, newSubDirHandle, log);
        }
    }
}

// Move all contents of a directory to a new subdirectory
async function archiveContents(
    dirHandle: FileSystemDirectoryHandle,
    archiveName: string,
    log: (msg: string) => void
) {
    const entries: { name: string; kind: 'file' | 'directory' }[] = [];
    for await (const entry of dirHandle.values()) {
        if (entry.name !== archiveName) {
            entries.push({ name: entry.name, kind: entry.kind });
        }
    }

    if (entries.length === 0) {
        log('Ritual Space is empty, no archiving needed.');
        return;
    }

    const archiveHandle = await dirHandle.getDirectoryHandle(archiveName, { create: true });
    log(`Creating sigilized archive: ${archiveName}`);

    for (const entry of entries) {
        if (entry.kind === 'file') {
            const fileHandle = await dirHandle.getFileHandle(entry.name);
            const file = await fileHandle.getFile();
            const newFileHandle = await archiveHandle.getFileHandle(entry.name, { create: true });
            const writable = await newFileHandle.createWritable();
            await writable.write(await file.arrayBuffer());
            await writable.close();
            await dirHandle.removeEntry(entry.name);
            log(`  ↳ Archived: ${entry.name}`);
        } else {
            const subDirHandle = await dirHandle.getDirectoryHandle(entry.name);
            const newSubDirHandle = await archiveHandle.getDirectoryHandle(entry.name, { create: true });
            await copyDirectoryContents(subDirHandle, newSubDirHandle, log);
            await dirHandle.removeEntry(entry.name, { recursive: true });
            log(`  ↳ Archived folder: ${entry.name}/`);
        }
    }
}

const DigitalAlchemy: React.FC = () => {
    const [sourceHandle, setSourceHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [targetHandle, setTargetHandle] = useState<FileSystemDirectoryHandle | null>(null);
    const [sourceName, setSourceName] = useState<string>('');
    const [targetName, setTargetName] = useState<string>('');
    const [isWorking, setIsWorking] = useState(false);
    const [log, setLog] = useState<string[]>([]);
    const [showConfirm, setShowConfirm] = useState(false);

    const addLog = (msg: string) => {
        setLog(prev => [...prev, msg]);
    };

    const selectSource = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'read' });
            setSourceHandle(handle);
            setSourceName(handle.name);
            setLog([`Source of Intent selected: ${handle.name}`]);
        } catch (e) {
            console.log('User cancelled or error:', e);
        }
    };

    const selectTarget = async () => {
        try {
            const handle = await window.showDirectoryPicker({ mode: 'readwrite' });
            setTargetHandle(handle);
            setTargetName(handle.name);
            addLog(`Ritual Space selected: ${handle.name}`);
        } catch (e) {
            console.log('User cancelled or error:', e);
        }
    };

    const initiateWorking = () => {
        if (!sourceHandle || !targetHandle) {
            setLog(['⚠ Both Source of Intent and Ritual Space must be selected.']);
            return;
        }
        setShowConfirm(true);
    };

    const executeWorking = async () => {
        setShowConfirm(false);
        if (!sourceHandle || !targetHandle) return;

        setIsWorking(true);
        setLog(['═══════════════════════════════════════']);
        addLog('⚗ INITIATING PARADIGM SHIFT ⚗');
        addLog('═══════════════════════════════════════');

        try {
            // Step 1: Archive existing ritual space contents
            const sigilName = generateSigilName();
            addLog('');
            addLog('Phase 1: Sigilizing Previous Reality...');
            await archiveContents(targetHandle, sigilName, addLog);

            // Step 2: Copy source contents to target
            addLog('');
            addLog('Phase 2: Manifesting New Intent...');
            await copyDirectoryContents(sourceHandle, targetHandle, addLog);

            // Step 3: Dissolve source contents
            addLog('');
            addLog('Phase 3: Dissolving Source of Intent...');
            for await (const entry of sourceHandle.values()) {
                if (entry.kind === 'file') {
                    await sourceHandle.removeEntry(entry.name);
                } else {
                    await sourceHandle.removeEntry(entry.name, { recursive: true });
                }
            }
            addLog('  ↳ Source energy consumed.');

            // Step 4: Leave VOID MARKER
            const voidFile = await sourceHandle.getFileHandle('VOID_MARKER', { create: true });
            const voidWritable = await voidFile.createWritable();
            await voidWritable.write('This folder has been consumed by the Digital Alchemy process. It is now a hollow shell.');
            await voidWritable.close();
            addLog('  ↳ Void Marker placed.');

            addLog('');
            addLog('═══════════════════════════════════════');
            addLog('✧ PARADIGM SHIFT COMPLETE ✧');
            addLog(`Previous reality preserved in: ${sigilName}`);
            addLog('The Intent has been made manifest.');
            addLog('═══════════════════════════════════════');
        } catch (e: any) {
            addLog(`⚠ Error during working: ${e.message}`);
        }

        setIsWorking(false);
    };

    return (
        <div className="alchemy-section">
            <div className="section-title">
                Digital Alchemy
                <div className="info-box-container">
                    <span className="info-icon">?</span>
                    <div className="info-tooltip">
                        <h4>Transmuting Code</h4>
                        The process of performing physical data operations to mirror internal intent. By "consuming" source files and transmogrifying ritual space, the practitioner anchors their will into the physical world through the computer as a consecrated ritual tool.
                    </div>
                </div>
            </div>
            <div className="control-group">
                <button className="secondary" onClick={selectSource}>
                    {sourceName || 'Source of Intent'}
                </button>
                <button className="secondary" onClick={selectTarget}>
                    {targetName || 'Ritual Space'}
                </button>
                <button onClick={initiateWorking} disabled={isWorking || !sourceHandle || !targetHandle}>
                    {isWorking ? 'Working...' : 'Initiate Working'}
                </button>
            </div>

            {showConfirm && (
                <div className="alchemy-confirm">
                    <div className="confirm-title">⚠ PARADIGM SHIFT WARNING ⚠</div>
                    <div className="confirm-text">
                        <p>You are about to perform a profound transformation.</p>
                        <p><strong>The Intent you have set within "{sourceName}"</strong> will replace the contents of your Ritual Space "{targetName}".</p>
                        <p>This represents a <em>paradigm shift</em> — the old reality will be transmuted.</p>
                        <p>The current contents of your Ritual Space will be preserved within a new <strong>sigilized folder</strong> (a cryptic archive).</p>
                        <p><strong>Note:</strong> The Source of Intent contents will be <em>consumed</em>. The folder itself will remain as an empty <strong>Hollow Shell</strong> containing only a void marker.</p>
                        <p style={{ color: '#ff6666' }}>This action cannot be undone through this interface.</p>
                    </div>
                    <div className="confirm-buttons">
                        <button onClick={executeWorking}>Accept Transformation</button>
                        <button className="secondary" onClick={() => setShowConfirm(false)}>Cancel</button>
                    </div>
                </div>
            )}

            {log.length > 0 && (
                <div className="alchemy-log">
                    {log.map((line, i) => <div key={i}>{line}</div>)}
                </div>
            )}
        </div>
    );
};

export default DigitalAlchemy;

