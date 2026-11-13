import { diagFlushNow, diagLog } from "@lib/api/diag";
import ErrorCard from "@core/ui/reporter/components/ErrorCard";
import { React } from "@metro/common";
import { ThemeContext } from "@ui/styles";
import { Falsy } from "react-native";

type ErrorBoundaryState = {
    hasErr: false;
} | {
    hasErr: true;
    error: Error;
};

export interface ErrorBoundaryProps {
    children: JSX.Element | Falsy | (JSX.Element | Falsy)[];
}

export default class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
    constructor(props: ErrorBoundaryProps) {
        super(props);
        this.state = { hasErr: false };
    }

    static contextType = ThemeContext;
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
        if (!this.state.hasErr) return this.props.children;

        return (
            <ErrorCard
                error={this.state.error}
                onRetryRender={() => this.setState({ hasErr: false })}
            />
        );
    }
}
