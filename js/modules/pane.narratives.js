;(function(undefined) {

  /**
   * Manylines Narratives Pane
   * ==========================
   *
   * This pane enables the user to compose narratives around his/her graph.
   */

  app.panes.narratives = function() {
    var self = this,
        $beforeMain = $('.before-main'),
        s = app.control.get('mainSigma');

    // Extending
    Pane.call(this,  {
      name: 'narratives'
    });

    // State
    this.thumbnails = [];
    this.mode = null;
    this.graph = null;

    // Emitters
    this.menuEmitters = function(dom) {

      /**
       * Adding a new narrative.
       */
      dom.on('click', '[data-app-narratives-action="add"]', function()  {
        self.dispatchEvent('narrative.add');
      });

      /**
       * Editing an existing narrative.
       */
      dom.on('click', '[data-app-narratives-action="edit"] a', function(e)  {
        var nid = $(this).parents('[data-app-narratives-action="edit"]').attr('data-app-narrative-id');

        self.dispatchEvent('narrative.select', nid);

        e.preventDefault();
        e.stopPropagation();
      });

      /**
       * Deleting an existant narrative
       */
      dom.on('click', '[data-app-narratives-action="delete"]', function()  {
        var nid = $(this).parents('[data-app-narratives-action="edit"]').attr('data-app-narrative-id');

        self.dispatchEvent('narrative.delete', nid);
      });
    };

    this.editionEmitters = function(dom) {

      /**
       * Going back to the menu
       */
      dom.on('click', '[data-app-narratives-action="back"]', function()  {
        self.dispatchEvent('narratives.back');
        menu();
      });

      /**
       * Show the modal that hold iframe code
       */
      dom.on('click', '[data-app-narratives-action="share"]', function(e)  {
        self.dispatchEvent('modal', {type: 'share'});
      });

      /**
       * Edit one of the possible fields
       */
      dom.on('change', '[data-app-narratives-editable]', function() {
        var prop = $(this).attr('data-app-narratives-editable'),
            val = $(this).val().trim();

        if (prop === 'title') {
          self.dispatchEvent('narrative.edit', {title: val});
        }
        else if (prop === 'slide_title') {
          self.dispatchEvent('narrative.edit', {editSlide: {title: val}});
        }
        else if (prop === 'slide_text') {
          self.dispatchEvent('narrative.edit', {editSlide: {text: val}});
        }
      });

      /**
       * Selecting a slide
       */
      dom.on('click', '.chosen-views-band [data-app-thumbnail-snapshot]', function() {
        if ($(this).parent().hasClass('active'))
          return;

        self.dispatchEvent('slide.select', $(this).attr('data-app-thumbnail-snapshot'));
      });
    };

    // Rendering possibilities
    function menu() {
      self.mode = 'menu';
      self.unmountThumbnails();

      // Templating
      app.templates.require(
        'narratives.menu',
        function(template) {
          var $newDom = $(template());

          $beforeMain.next('div').replaceWith($newDom);
          self.renderNarrativeList();
          self.menuEmitters($newDom);
        }
      );
    }

    function edition(narrative) {
      self.mode = 'edition';

      // Templating
      app.templates.require('narratives.edit', function(template) {
        var $newDom = $(template(narrative || {}));
        $beforeMain.next('div').replaceWith($newDom);

        self.renderSnapshots();
        self.editionEmitters($newDom);

        handleCurrentSlide();
      });
    }

    function slide(data) {
      var $container = $('.slide-container');

      if (self.graph)
        self.removeChildModule(self.graph);

      // Templating
      app.templates.require('narratives.slide', function(template) {

        $container.empty().append(template({
          slide: data,
          placeholder: i18n.t('narratives.default_slide_text')
        }));

        $('[data-app-thumbnail-snapshot="' + data.snapshot + '"]').parent().addClass('active');

        // Adding the graph
        var snapshot = app.control.query('snapshotById', data.snapshot);
        self.graph = self.addChildModule(app.modules.graph, [$container, {snapshot: snapshot}]);
      });
    }

    // Methods
    this.renderNarrativeList = function() {
      app.templates.require('narratives.item', function(template) {

          // Templating the menu items
          var $list = $('.narratives-list');

          app.control.get('narratives').forEach(function(narrative) {
            $list.append(template(narrative));
          });
        }
      );
    };

    this.renderSnapshots = function() {
      var snapshots = app.control.get('snapshots'),
          narrative = app.control.query('narrativeById', app.control.get('currentNarrative'));

      if (!snapshots.length)
        return;

      var $unchosen = $('.unchosen-views-band'),
          $chosen = $('.chosen-views-band');

      // Cleaning
      $unchosen.empty();
      $chosen.empty();
      this.unmountThumbnails();

      // Templating
      app.templates.require('misc.snapshot', function(template) {
        var order = narrative.slides.map(function(slide) {
          return slide.snapshot;
        });

        // TODO: this is hardly optimal...
        var orderedSnapshots = order.map(function(snaphotId) {
          return app.utils.first(snapshots, function(s) { return s.id === snaphotId});
        }).concat(snapshots.filter(function(s) {
          return !~order.indexOf(s.id);
        }));

        orderedSnapshots.forEach(function(snapshot) {
          var $el = $(template(snapshot));

          var $container =
            narrative.slides.some(function(slide) {
              return slide.snapshot === snapshot.id;
            }) ? $chosen : $unchosen;

          $container.append($el);

          var filter = (snapshot.filters || [])[0],
              category = app.control.query('nodeCategory', (filter || {}).category);

          self.thumbnails.push(
            new Thumbnail(
              $el.find('.view-thumbnail')[0],
              {
                category: category,
                camera: snapshot.view.camera,
                filter: filter
              }
            )
          );

          self.refreshThumbnails();
          self.registerSortables();
        });

        // TODO: dirty, this should not be here.
        // Getting selected slide
        var currentSlide = app.control.get('currentSlide');
        if (currentSlide) {
          $('[data-app-thumbnail-snapshot]').parent().removeClass('active');
          $('[data-app-thumbnail-snapshot="' + currentSlide + '"]').parent().addClass('active');
        }
      });
    };

    this.refreshThumbnails = function() {
      s.refresh();
      this.thumbnails.forEach(function(t) {
        t.render();
      });
    };

    this.unmountThumbnails = function() {
      this.thumbnails.forEach(function(t) {
        t.unmount();
      });

      this.thumbnails = [];
    };

    this.registerSortables = function() {
      this.unregisterSortables();

      // Unchosen list
      this.unchosen = new Sortable(
        $('.unchosen-views-band')[0],
        {
          group: 'snapshots',
          draggable: 'li',
          filter: '.no-drag',
          ghostClass: 'drag-ghost',
          onAdd: function(e) {
            $(e.item).removeClass('active');
          }
        }
      );

      // Chosen list with attached events
      this.chosen = new Sortable(
        $('.chosen-views-band')[0],
        {
          group: 'snapshots',
          draggable: 'li',
          filter: '.no-drag',
          ghostClass: 'drag-ghost',
          onAdd: function(e) {
            var snapshotId = $(e.item).find('.view-thumbnail').attr('data-app-thumbnail-snapshot');

            var order = $('.chosen-views-band [data-app-thumbnail-snapshot]').get().map(function(e) {
              return $(e).attr('data-app-thumbnail-snapshot');
            });

            self.dispatchEvent('narrative.edit', {addSlide: snapshotId, reorderSlides: order});
          },
          onRemove: function(e) {
            var snapshotId = $(e.item).find('.view-thumbnail').attr('data-app-thumbnail-snapshot');
            self.dispatchEvent('narrative.edit', {removeSlide: snapshotId});
          },
          onUpdate: function(e) {
            var order = $('.chosen-views-band [data-app-thumbnail-snapshot]').get().map(function(e) {
              return $(e).attr('data-app-thumbnail-snapshot');
            });

            self.dispatchEvent('narrative.edit', {reorderSlides: order});
          }
        }
      );
    };

    this.unregisterSortables = function() {
      if (this.unchosen || this.chosen) {
        this.unchosen.destroy();
        this.chosen.destroy();
      }
    };

    // Receptors
    function handleEdition(d, e) {
      if (self.mode !== 'menu')
        return;

      edition(e.data);
    }

    function handleCurrentSlide(d, e) {
      if (self.mode !== 'edition')
        return;

      var currentSlide = app.control.query('currentSlide');

      if (currentSlide) {

        // Activating the correct slide
        $('[data-app-thumbnail-snapshot]').parent().removeClass('active');
        $('[data-app-thumbnail-snapshot="' + currentSlide.snapshot + '"]').parent().addClass('active');
        slide(currentSlide);
      }
      else {
        $('.slide-container').empty();
      }
    }

    this.triggers.events['narrative.added'] = handleEdition;
    this.triggers.events['narrative.selected'] = handleEdition;

    this.triggers.events['currentSlide.updated'] = handleCurrentSlide;

    this.triggers.events['narrative.deleted'] = function(d, e) {
      var nid = e.data;

      $('[data-app-narrative-id="' + nid + '"]').parent().fadeOut();
    };

    // Initialization
    this.didRender = function() {
      var currentNarrative = app.control.get('currentNarrative');

      if (currentNarrative)
        edition(app.control.query('narrativeById', currentNarrative));
      else
        menu();
    };

    // On unmount
    this.willUnmount = function() {
      this.unmountThumbnails();
      this.unregisterSortables();
    };
  };
}).call(this);
