import {Guild, Member, Role, RoleOptions} from 'eris';
import { InteractionCreate } from '../index';
import AbstractCommand from './AbstractCommand';

const { pluginConfigs: { CommandPlugin } } = require('../../../../package.json');

export default class ColorCommand extends AbstractCommand<'color'> {
  public static Name = 'color';

  public get guildId() {
    return CommandPlugin.hotlineGuildId;
  }

  public get schema() {
    return {
      name:        ColorCommand.Name,
      description: 'Update your color',
      options:     [
        {
          name:        'join',
          description: 'Join a color role',
          type:        1,
          options:     [
            {
              name:        'role',
              description: 'Role to join',
              type:        8,
              required:    true,
            },
          ],
        },
        {
          name:        'create',
          description: 'Create a color role',
          type:        1,
          options:     [
            {
              name:        'name',
              description: 'Name of role/color to create',
              type:        3,
              required:    true,
            },
            {
              name:        'hex',
              description: 'Hex color to use as the role color',
              type:        3,
              required:    true,
            },
          ],
        },
      ],
    };
  }

  public async process(interaction) {
    if (!interaction.member.roles.includes(CommandPlugin.memberRoleId)) {
      await this.acknowledge(interaction, 2);

      return;
    }

    const subCommand = interaction.data.options[0];
    if (subCommand.name === 'join') {
      return this.joinColor(interaction, subCommand.options);
    }

    if (subCommand.name === 'create') {
      return this.createColor(interaction, subCommand.options);
    }

    await this.acknowledge(interaction, 2);
  }

  private async joinColor(interaction: InteractionCreate, subCommand: [{ name: 'role'; value: string }]) {
    const guild       = this.client.guilds.get(interaction.guild_id);
    const dividerRole = guild.roles.get(CommandPlugin.roleSeparatorId);
    const role        = guild.roles.get(subCommand[0].value);

    if (interaction.member.roles.includes(role.id) || dividerRole.position < role.position) {
      await this.acknowledge(interaction, 2);

      return;
    }

    await this.leaveOtherRoles(guild, interaction.member, role);
    await guild.addMemberRole(interaction.member.user.id, role.id, 'Joining role color');
    await this.acknowledge(interaction, 5, {content: 'Role created', flags: 64});
  }

  private async createColor(
    interaction: InteractionCreate,
    subCommand: [{ name: 'name'; value: string }, { name: 'color'; value: string }],
  ) {
    const guild       = this.client.guilds.get(interaction.guild_id);
    const dividerRole = guild.roles.get(CommandPlugin.roleSeparatorId);
    const newPosition = dividerRole.position - 1;
    const role        = await guild.createRole({
      name:        subCommand[0].value,
      color:       parseInt(subCommand[1].value.replace(/^#/, ''), 16),
      permissions: 0,
      hoist:       false,
      mentionable: false,
      position:    newPosition,
    } as RoleOptions,                          'Creating role color');
    await this.leaveOtherRoles(guild, interaction.member, role);
    await guild.addMemberRole(interaction.member.user.id, role.id, 'Joining role color');

    await this.acknowledge(interaction, 5, {content: 'Role join', flags: 64});
  }

  private async leaveOtherRoles(guild: Guild, member: Member, safeRole: Role) {
    const dividerRole = guild.roles.get(CommandPlugin.roleSeparatorId);
    for (const roleId of member.roles) {
      const role = guild.roles.get(roleId);
      if (dividerRole.position <= role.position || role.id === safeRole.id) {
        continue;
      }

      await guild.removeMemberRole(member.user.id, role.id, 'Joining a different role color');
    }
  }
}
