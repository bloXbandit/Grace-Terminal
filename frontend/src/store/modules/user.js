import { set } from '@vueuse/core';
import { defineStore } from 'pinia'

export const useUserStore = defineStore('user', {
  state: () => ({
    user: {},
    membership: {},
    points: { total: 0, accounts: [] }  // Initialize with default structure to prevent undefined errors
  }),
  actions: {
    setUser(user) {
      console.log('setUser', user);
      this.user = user;
    },
    setMembership(membership) {
      console.log('setMembership', membership);
      this.membership = membership;
    },
    setPoints(points) {
      this.points = points;
    },
    clear(){
      this.user = {};
      this.membership = {};
      this.points = {};
    }

  },
  persist: true,
})
