import React from "react";

function App() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-8">
        <header className="text-center mb-12">
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            Welcome to Berkeley25
          </h1>
          <p className="text-xl text-gray-600">
            A modern React + TypeScript + Tailwind CSS application
          </p>
        </header>

        <main className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow-lg p-8">
            <h2 className="text-2xl font-semibold text-gray-800 mb-6">
              Getting Started
            </h2>
            <div className="space-y-4">
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span className="text-gray-700">React 18 with TypeScript</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span className="text-gray-700">Tailwind CSS for styling</span>
              </div>
              <div className="flex items-center space-x-3">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span className="text-gray-700">Vite for fast development</span>
              </div>
            </div>

            <div className="mt-8 p-4 bg-gray-50 rounded-lg">
              <h3 className="text-lg font-medium text-gray-800 mb-2">
                Available Scripts:
              </h3>
              <div className="space-y-2 text-sm">
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded">
                    npm run dev
                  </code>{" "}
                  - Start development server
                </div>
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded">
                    npm run build
                  </code>{" "}
                  - Build for production
                </div>
                <div>
                  <code className="bg-gray-200 px-2 py-1 rounded">
                    npm run preview
                  </code>{" "}
                  - Preview production build
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
