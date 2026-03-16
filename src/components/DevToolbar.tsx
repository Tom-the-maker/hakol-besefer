// Dev Dashboard Button
// Simple button that opens the dev dashboard in a new tab
// Only visible in development mode

import React from 'react';

const DevDashboardButton: React.FC = () => {
    // Only show in development
    if (!import.meta.env.DEV) return null;

    return (
        <button
            onClick={() => window.open('/dev', '_blank')}
            className="fixed bottom-4 right-4 z-[9999] bg-gray-900 hover:bg-gray-800 text-white px-4 py-2 rounded-full shadow-lg transition-all flex items-center gap-2 text-sm font-bold border border-gray-700"
            title="Open Dev Dashboard"
        >
            <span>🧪</span>
            <span>Dev</span>
        </button>
    );
};

export default DevDashboardButton;
