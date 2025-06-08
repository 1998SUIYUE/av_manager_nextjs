import React, { useState } from 'react';

interface DirectoryInputProps {
  onSetDirectory: (folderPath: string) => void;
  onClearDirectory: () => void;
}

const DirectoryInput: React.FC<DirectoryInputProps> = ({ onSetDirectory, onClearDirectory }) => {
  const [folderPath, setFolderPath] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSetDirectory(folderPath);
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col sm:flex-row gap-2 w-full max-w-lg">
      <input
        type="text"
        value={folderPath}
        onChange={(e) => setFolderPath(e.target.value)}
        placeholder="输入电影目录路径，例如: D:/Movies"
        className="flex-grow p-2 rounded-md bg-gray-800 text-white border border-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500"
      />
      <button
        type="submit"
        className="px-4 py-2 bg-blue-600 rounded-md hover:bg-blue-700 font-semibold"
      >
        设置目录
      </button>
      <button
        type="button"
        onClick={onClearDirectory}
        className="px-4 py-2 bg-red-600 rounded-md hover:bg-red-700 font-semibold"
      >
        清除目录
      </button>
    </form>
  );
};

export default DirectoryInput; 