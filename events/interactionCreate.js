module.exports = {
	name: 'interactionCreate',
	execute(interaction) {
		console.log(`[log] ${interaction.user.tag} in #${interaction.channel.name} triggered an interaction.`);
	},
};