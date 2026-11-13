import { diagFlushNow, diagLog } from "@lib/api/diag";
import ErrorCard from "@core/ui/reporter/components/ErrorCard";
import { React } from "@metro/common";
import { Falsy } from "react-native";

type ErrorBoundaryState = {
    hasErr: false;
} | {
    hasErr: true;
    error: Error;
};

export interface ErrorBoundaryProps {
    children: JSX.Element | Falsy | (JSX.Element | Falsy)[];
    // ROUND 13 (diagnostic): identifies which boundary instance rendered.
    // The rc log showed Plugins re-rendering 10x while the memoized
    // CustomPageRenderer re-rendered 2x — this counter says whether the
    // boundary (the parent of the page) re-rendered with it (parent-driven)
    // or stayed at 2 (the driver is inside the page itself).
    label?: string;
}

const renderCounts = new Map<string, number>();

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasErr: false };
    }

    // ROUND 12: NO contextType here — deliberately. This boundary never
    // reads this.context, but declaring `static contextType =
    // ThemeContext` subscribes the class to every theme-value change,
    // re-rendering the whole page subtree below it. On Discord 353 that
    // produced the Plugins black screen: the page re-rendered ~4x/s in
    // a loop that never committed (rb diag log, 2026-11-13 15:30), while
    // the memoized CustomPageRenderer above it re-rendered only twice
    // — proving the driver was a context change reaching the page
    // through this boundary, not navigation or the page's own code.
    // Removing the dead subscription severs that path; the fallback
    // ErrorCard is unaffected (it themes itself).
    static getDerivedStateFromError = (error: Error) => ({ hasErr: true, error });

    // ROUND 11 (diagnostic): if a render throw is caught by this
    // boundary, name it in the diag log (flushed immediately). A caught
    // throw explains a black screen only if the fallback itself fails
    // to render — the log tells us whether a throw happened at all.
    componentDidCatch(error: Error, info: React.ErrorInfo) {
        try {
            const stackFirst = (error?.stack || info?.componentStack || "").split("\n")[0]?.slice(0, 200) ?? "";
            diagLog(`ERRBOUNDARY CAUGHT ${error?.name}: ${error?.message} | ${stackFirst}`);
            diagFlushNow();
        } catch { /* never break error handling for logging */ }
    }

    render() {
        // ROUND 13 (diagnostic): count renders per labelled instance.
        if (this.props.label) {
            const n = (renderCounts.get(this.props.label) ?? 0) + 1;
            renderCounts.set(this.props.label, n);
            try { diagLog(`ERRBOUNDARY RENDER label=${this.props.label} n=${n}`); diagFlushNow(); } catch { /* never break rendering for logging */ }
        }

        if (!this.state.hasErr) return this.props.children;

        return (
            <ErrorCard
                error={this.state.error}
                onRetryRender={() => this.setState({ hasErr: false })}
            />
        );
    }
}
