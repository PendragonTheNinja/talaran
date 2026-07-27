import { Link, useParams, useNavigate } from 'react-router-dom'
import ManualBrowser from './ManualBrowser'
import './Manual.css'

/**
 * Public /manual route. Chrome mirrors NewsPage so the two public pages read as
 * siblings; the browser itself is shared with the in-game panel.
 */
export default function ManualPage() {
    const { section, slug } = useParams<{ section?: string; slug?: string }>()
    const navigate = useNavigate()

    return (
        <div className="manual-page-shell">
            <div className="manual-page-header">
                <Link to="/" className="manual-page-back">
                    <span>✦</span>
                    <span className="manual-page-wordmark">Talaran</span>
                </Link>
                <nav className="manual-page-nav">
                    <Link to="/" className="manual-page-nav-link">Play</Link>
                    <Link to="/news" className="manual-page-nav-link">News</Link>
                    <Link to="/manual" className="manual-page-nav-link active">Manual</Link>
                </nav>
            </div>

            <div className="manual-page-hero">
                <p className="manual-page-eyebrow">✦ A Guide to Taiar Island</p>
                <h1 className="manual-page-title">The Manual of Talaran</h1>
                <p className="manual-page-subtitle">
                    Compiled by the Geographer, who tried everything once
                </p>
            </div>

            <ManualBrowser
                variant="page"
                initialSection={section}
                initialSlug={slug}
                onLocationChange={(nextSection, nextSlug) => {
                    navigate(nextSection && nextSlug ? `/manual/${nextSection}/${nextSlug}` : '/manual')
                }}
            />
        </div>
    )
}
