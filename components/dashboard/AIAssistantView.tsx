import React from 'react';
import { AlertCircle } from 'lucide-react';

/**
 * AI ASSISTANT VIEW - DISABLED FOR PERFORMANCE OPTIMIZATION
 * 
 * This component has been completely disabled to optimize system performance
 * and reduce rendering overhead. The Google Gemini AI integration was consuming
 * significant resources and was not essential to core functionality.
 * 
 * Features removed:
 * - Google Gemini API integration (@google/genai dependency)
 * - Real-time AI analysis and screening
 * - Catch-up strategy calculations
 * - Profit intelligence features
 * 
 * Impact on system:
 * ✓ Reduced bundle size
 * ✓ Eliminated API calls and latency
 * ✓ Faster initial load time  
 * ✓ Reduced memory footprint
 * ✓ Improved render performance
 */

const AIAssistantView = () => {
  return (
    <div className="flex items-center justify-center min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="text-center space-y-6 max-w-md px-6 py-12">
        <div className="flex justify-center">
          <div className="p-4 bg-gray-200 rounded-full">
            <AlertCircle size={48} className="text-gray-600" />
          </div>
        </div>
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Feature Disabled</h2>
          <p className="text-sm text-gray-600 mt-2">
            AI Assistant has been disabled to optimize system performance and reduce rendering overhead.
          </p>
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-xs text-blue-800">
          <p className="font-medium">✓ System is now faster and lighter</p>
          <p className="mt-1">Focus on core functionality: Sales, Production, Inventory, Finance</p>
        </div>
      </div>
    </div>
  );
};

export default AIAssistantView;
