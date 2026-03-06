/**
 * @vitest-environment jsdom
 */
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueueTable } from './QueueTable';

describe('QueueTable Component', () => {
    it('displays loading state when isLoading is true', () => {
        render(<QueueTable guilds={[]} isLoading={true} />);
        expect(screen.getByText(/Loading guilds/i)).toBeInTheDocument();
    });

    it('displays empty state when guilds array is empty', () => {
        render(<QueueTable guilds={[]} isLoading={false} />);
        expect(screen.getByText('No Guilds Configured')).toBeInTheDocument();
    });

    it('displays guilds in table when provided', () => {
        const guildsData = [
            { guildId: '123456', moderationEnabled: true, giveawaysEnabled: false },
        ];

        render(<QueueTable guilds={guildsData} isLoading={false} />);

        expect(screen.getByText('123456')).toBeInTheDocument();
        expect(screen.getByText('Configured Guilds')).toBeInTheDocument();

        // Check for ON and OFF badges
        expect(screen.getByText('ON')).toBeInTheDocument(); // Moderation
        expect(screen.getByText('OFF')).toBeInTheDocument(); // Giveaways
    });
});
