/**
 * Cleanup old state snapshots
 * 
 * Problem: The system was inserting a new stateSnapshot row every 30 seconds,
 * leading to thousands of duplicate rows per day.
 * 
 * Solution: Keep only the latest snapshot per type (current/target).
 * The code has been optimized to:
 * 1. Only write when state changes
 * 2. Delete old snapshots before inserting new ones
 * 
 * This migration cleans up historical duplicates.
 */

export async function up(knex) {
	console.log('Cleaning up old state snapshots...');
	
	// Get the latest snapshot for each type
	const latestCurrent = await knex('stateSnapshot')
		.where({ type: 'current' })
		.orderBy('id', 'desc')
		.first();
	
	const latestTarget = await knex('stateSnapshot')
		.where({ type: 'target' })
		.orderBy('id', 'desc')
		.first();
	
	// Build list of IDs to keep
	const idsToKeep = [];
	if (latestCurrent) idsToKeep.push(latestCurrent.id);
	if (latestTarget) idsToKeep.push(latestTarget.id);
	
	// Count how many we'll delete
	const totalCount = await knex('stateSnapshot').count('* as count').first();
	const deleteCount = totalCount.count - idsToKeep.length;
	
	if (deleteCount > 0) {
		// Delete all except the latest
		await knex('stateSnapshot')
			.whereNotIn('id', idsToKeep)
			.delete();
		
		console.log(`Deleted ${deleteCount} old state snapshot(s)`);
		console.log(`   Kept ${idsToKeep.length} latest snapshot(s)`);
	} else {
		console.log('No old snapshots to clean up');
	}
	
	// Show final state
	const remaining = await knex('stateSnapshot').select('id', 'type', 'createdAt');
	remaining.forEach(row => {
		console.log(`   - ${row.type}: ID ${row.id} (${row.createdAt})`);
	});
}

export async function down(knex) {
	// No rollback needed - we can't restore deleted snapshots
	console.log('Cannot restore deleted snapshots (no rollback available)');
}
