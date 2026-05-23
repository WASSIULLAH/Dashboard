import React from 'react';

const EmailSkeleton: React.FC = () => {
  return (
    <div className="flex items-center px-8 py-3 animate-pulse">
      <div className="w-4 h-4 bg-gray-200 rounded"></div>
      <div className="ml-4 w-4 bg-gray-200 rounded h-4"></div>
      <div className="w-48 ml-4 h-4 bg-gray-200 rounded"></div>
      <div className="flex-1 flex items-center gap-3 mx-4">
        <div className="w-20 h-5 bg-gray-100 rounded"></div>
        <div className="w-1/3 h-4 bg-gray-200 rounded"></div>
        <div className="w-1/4 h-4 bg-gray-100 rounded"></div>
      </div>
      <div className="w-12 h-4 bg-gray-100 rounded"></div>
    </div>
  );
};

export const EmailListSkeleton: React.FC<{ count?: number }> = ({ count = 5 }) => {
  return (
    <div className="divide-y divide-[#f1f5f9]">
      {Array.from({ length: count }).map((_, i) => (
        <EmailSkeleton key={i} />
      ))}
    </div>
  );
};
