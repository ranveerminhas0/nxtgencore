/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MetricCard } from './MetricCard';

// Dummy icon to pass as prop
const DummyIcon = React.forwardRef<SVGSVGElement, any>((props, ref) => <svg ref={ref} data-testid="dummy-icon" {...props} />) as any;
DummyIcon.displayName = 'DummyIcon';

describe('MetricCard Component', () => {
    it('renders correctly with given props', () => {
        render(
            <MetricCard
                label="Total Users"
                value={1500}
                icon={DummyIcon}
                color="text-blue-500"
            />
        );

        expect(screen.getByText('Total Users')).toBeInTheDocument();
        expect(screen.getByText('1500')).toBeInTheDocument();
        expect(screen.getByTestId('dummy-icon')).toBeInTheDocument();
    });
});
