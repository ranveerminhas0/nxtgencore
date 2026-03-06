/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusBadge } from './StatusBadge';

describe('StatusBadge Component', () => {
    it('renders verified status correctly', () => {
        render(<StatusBadge status="verified" />);
        expect(screen.getByText('Verified')).toBeInTheDocument();
    });

    it('renders warned status correctly', () => {
        render(<StatusBadge status="warned_5m" />);
        expect(screen.getByText('Warning_5m')).toBeInTheDocument();
    });

    it('renders kicked status correctly', () => {
        render(<StatusBadge status="kicked" />);
        expect(screen.getByText('Kicked')).toBeInTheDocument();
    });

    it('renders pending status as default', () => {
        render(<StatusBadge status="unknown_status" />);
        expect(screen.getByText('Pending')).toBeInTheDocument();
    });
});
