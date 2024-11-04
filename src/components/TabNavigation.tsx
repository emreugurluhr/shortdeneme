import React from 'react';

interface TabNavigationProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

const TabNavigation: React.FC<TabNavigationProps> = ({
  activeTab,
  onTabChange,
}) => {
  return (
    <nav className="flex border-b">
      <button
        className={`px-4 py-2 ${
          activeTab === 'AI Visuals'
            ? 'border-b-2 border-purple-600 text-purple-600'
            : 'text-gray-600'
        }`}
        onClick={() => onTabChange('AI Visuals')}
      >
        AI Visuals
      </button>
      <div className="flex-grow"></div>
      <button className="px-4 py-2 text-blue-600">View All</button>
    </nav>
  );
};

export default TabNavigation;
