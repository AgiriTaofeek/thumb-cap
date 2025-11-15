import React from "react"
import { Link, Route, Routes } from "react-router-dom"
import Upload from "./pages/Upload"
import Review from "./pages/Review"
import Editor from "./pages/Editor"
import Publish from "./pages/Publish"
import OAuthCallback from "./pages/OAuthCallback"

export default function App() {
  return (
    <div className="app">
      <header className="header">
        <div className="brand">ThumbCap AI</div>
        <nav className="nav">
          <Link to="/">Upload</Link>
        </nav>
      </header>
      <main className="main">
        <Routes>
          <Route path="/" element={<Upload />} />
          <Route path="/review/:videoId" element={<Review />} />
          <Route path="/editor/:videoId/:variantId" element={<Editor />} />
          <Route path="/publish/:videoId" element={<Publish />} />
          <Route path="/oauth/callback" element={<OAuthCallback />} />
        </Routes>
      </main>
    </div>
  )
}

