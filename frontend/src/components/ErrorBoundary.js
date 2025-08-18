import React from "react";

export class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error, info) {
    // Log error to service
    console.log("error", error)
  }
  render() {
    if (this.state.hasError) {
      console.log("error",this.state)
      return <div>Something went wrong.</div>;
    }
    return this.props.children;
  }
}
